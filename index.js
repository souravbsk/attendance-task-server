const express = require("express");
const app = express();
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const port = process.env.PORT || 5000;

const corsOptions = {
  origin: [
    "https://attendance-tracker-client.vercel.app",
    "https://attendance-tracker-client-souravbsks-projects.vercel.app",
    "http://localhost:3000",
  ],
};

//middleware
app.use(cors(corsOptions));
app.use(express.json());



// fetch location api


app.get("/api/ip-api/:ip", async (req, res) => {
  try {
    const ip = req.params.ip; // Use req.params.ip to get the IP
    const response = await fetch(`http://ip-api.com/json/${ip}`);
    if (response.ok) {
      const data = await response.json();
      res.json(data); // Send the JSON response
    } else {
      res.status(response.status).send("Error fetching data from IP-API");
    }
  } catch (error) {
    res.status(500).send("Internal server error");
  }
});



//verify jwt
const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  console.log(authorization);
  if (!authorization) {
    return res
      .status(401)
      .send({ error: true, message: "unauthorized access" });
  }
  const token = authorization.split(" ")[1];

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      res.status(401).send({ error: true, message: "unauthorized access" });
    }
    req.decoded = decoded;
    next();
  });
};

const uri = process.env.URI;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const run = async () => {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    const attendanceCollections = client
      .db("AttendanceTask")
      .collection("attendance");

    const employeeCollections = client.db("AttendanceTask").collection("users");

    // jwt token collection
    app.post("/api/jwt", (req, res) => {
      const user = req.body.email;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET);
      res.send({ token });
    });

    app.get("/api/users/admin/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      console.log(req.decoded);
      if (req.decoded !== email) {
        return res.send({ admin: false });
      }
      const query = { email: email };
      const user = await employeeCollections.findOne(query);
      const result = { admin: user?.role === "admin" };
      res.send(result);
    });

    //verify admin middleware ________________________
    const verifyAdmin = async (req, res, next) => {
      console.log(req.decoded);
      const email = req?.decoded;
      console.log(email);
      const query = { email: email };
      const user = await employeeCollections.findOne(query);
      if (user?.role !== "admin") {
        return res
          .status(403)
          .send({ error: true, message: "forbidden request" });
      }
      next();
    };

    //user create api __________________________________

    app.post("/api/usersexist/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const filter = { email: email };
        const existingUser = await employeeCollections.findOne(filter);
        if (!existingUser) {
          return res.send({
            isUserExist: false,
            message: "Sorry Your you have no access to create account",
          });
        } else {
          return res.send({
            isUserExist: true,
            message: "please register",
          });
        }
      } catch (error) {
        res.status(500).json({ message: "Internal server error" });
      }
    });

    app.put("/api/users", async (req, res) => {
      try {
        const newUser = req.body;
        const filter = { email: newUser.email };
        const existingUser = await employeeCollections.findOne(filter);
        if (existingUser) {
          return res.send({
            isUserExist: true,
            message: "Sorry Your you have no access to create account",
          });
        }
        const updateUser = {
          $set: {
            email: newUser.email,
            phone: newUser.phone,
            image: newUser.image,
            isAccount: true,
          },
        };
        const result = await employeeCollections.updateOne(filter, updateUser);

        res.send(result);
      } catch (error) {
        res.status(500).json({ message: "Internal server error" });
      }
    });

    //attendance api ____________________________
    app.get("/api/attendance/:email", verifyJWT, async (req, res) => {
      try {
        const userEmail = req?.params?.email;
        const query = { email: userEmail };
        const user = await employeeCollections.findOne(query);
        const workResults = await attendanceCollections.find(query).sort({ _id: -1 }).toArray();
        const allWorkResult = workResults.map((workResult) => {
          return { ...workResult, user };
        });

        res.send(allWorkResult);
      } catch (error) {
        res.status(500).json({ message: "Internal server error" });
      }
    });

    app.post("/api/attendance", verifyJWT, async (req, res) => {
      try {
        const attendanceData = req.body;
        const result = await attendanceCollections.insertOne(attendanceData);
        res.send(result);
      } catch (error) {
        res.status(500).json({ message: "Internal server error" });
      }
    });

    app.put("/api/attendance/:id", verifyJWT, async (req, res) => {
      try {
        const attendanceData = req.body;
        const attendanceId = req.params.id;
        console.log("attendanceData", attendanceData, attendanceId);
        const filter = { _id: new ObjectId(attendanceId) };
        const updateAttendanceData = {
          $set: {
            endTime: attendanceData.endTime,
            totalWork: attendanceData.totalWork,
          },
        };

        const result = await attendanceCollections.updateOne(
          filter,
          updateAttendanceData
        );
        res.send(result);
      } catch (error) {
        res.status(500).json({ message: "Internal server error" });
      }
    });

    //admin api __________________________________

    //get: all employee____________
    app.get("/api/admin/employee", verifyJWT, verifyAdmin, async (req, res) => {
      try {
        const query = {};
        const result = await employeeCollections.find(query).toArray();
        res.send(result);
      } catch (error) {
        res.status(500).json({ message: "Internal server error" });
      }
    });

    //post: create employee________
    app.post(
      "/api/admin/employee",
      verifyJWT,
      verifyAdmin,
      async (req, res) => {
        try {
          const employeeData = req.body;

          const totalEmployees = await employeeCollections.countDocuments({});
          const employeeId = `#B&V${(totalEmployees + 1)
            .toString()
            .padStart(2, "0")}`;
          //add role and image
          employeeData.employeeId = employeeId;
          employeeData.role = "employee";
          employeeData.image = "";
          employeeData.isAccount = false;
          // is exist email in database checkk
          const existingEmployee = await employeeCollections.findOne({
            email: employeeData.email,
          });
          console.log(existingEmployee);
          if (existingEmployee) {
            return res.send({
              isEmailExist: true,
              message: "Employee with this email already exists.",
            });
          }
          const result = await employeeCollections.insertOne(employeeData);
          res.send(result);
        } catch (error) {
          res.status(500).json({ message: "Internal server error" });
        }
      }
    );

    app.put(
      "/api/admin/employee/:id",
      verifyJWT,
      verifyAdmin,
      async (req, res) => {
        console.log("object");
        try {
          const employeeId = req.params.id;
          const employee = req.body;
          const filter = { _id: new ObjectId(employeeId) };

          const existingEmployee = await employeeCollections.findOne({
            email: employee.email,
          });
          if (existingEmployee) {
            return res.send({
              isEmailExist: true,
              message: "Employee with this email already exists.",
            });
          }

          const updateEmployeeData = {
            $set: {
              name: employee?.name,
              designation: employee.designation,
              email: employee.email,
              phone: employee.phone,
            },
          };

          const result = await employeeCollections.updateOne(
            filter,
            updateEmployeeData
          );
          res.send(result);
        } catch (error) {
          res.status(500).json({ message: "Internal server error" });
        }
      }
    );

    //delete: employee________
    app.delete(
      "/api/admin/employee/:id",
      verifyJWT,
      verifyAdmin,
      async (req, res) => {
        try {
          const employeeId = req.params.id;
          const filter = { _id: new ObjectId(employeeId) };
          const result = await employeeCollections.deleteOne(filter);
          res.send(result);
        } catch (error) {
          res.status(500).json({ message: "Internal server error" });
        }
      }
    );

    //attendance list api_______________________
    // all employee Name
    app.get(
      "/api/admin/employeeName",
      verifyJWT,
      verifyAdmin,
      async (req, res) => {
        try {
          const query = {};
          const options = {
            projection: { _id: 1, name: 1, email: 1, employeeId: 1 },
          };
          const result = await employeeCollections
            .find(query, options)
            .toArray();
          res.send(result);
        } catch (error) {
          res.status(500).json({ message: "Internal server error" });
        }
      }
    );

    // get attendance list
    app.get(
      "/api/admin/attendance/",
      verifyJWT,
      verifyAdmin,
      async (req, res) => {
        try {
          const email = req?.query?.email;
          console.log(email, "dfs");
          const fromTimestamp = req?.query?.fromDate;
          const toTimestamp = req?.query?.toDate;
          console.log(fromTimestamp, toTimestamp, "dfssadfsfs");

          let query = {};

          if (fromTimestamp && toTimestamp) {
            query.date = {
              $gte: new Date(parseInt(fromTimestamp)).getTime(),
              $lte: new Date(parseInt(toTimestamp)).getTime(),
            };
          } else {
            if (!email) {
              query = {};
            } else {
              if (email && fromTimestamp && toTimestamp) {
                query.email = email;
                query.date = {
                  $gte: new Date(parseInt(fromTimestamp)).getTime(),
                  $lte: new Date(parseInt(toTimestamp)).getTime(),
                };
              } else if (email) {
                query.email = email;
              }
            }
          }

          console.log(query);
          const result = await attendanceCollections.find(query).sort({ _id: -1 }).toArray();
          res.send(result);
        } catch (error) {
          res.status(500).json({ message: "Internal server error" });
        }
      }
    );

    //employee attendance details
    app.post(
      `/api/admin/attendance/:id`,
      verifyJWT,
      verifyAdmin,
      async (req, res) => {
        try {
          const attendanceId = req.params.id;
          const email = req.query.email;
          const filter = { _id: new ObjectId(attendanceId) };
          const query = { email: email };
          const employeeDetails = await employeeCollections.findOne(query);
          const attendanceDetails = await attendanceCollections.findOne(filter);
          const employeeAttendanceDetails = {
            employeeDetails,
            ...attendanceDetails,
          };
          res.send(employeeAttendanceDetails);
        } catch (error) {
          res.status(500).json({ message: "Internal server error" });
        }
      }
    );

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
};
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("attendance task server");
});

app.listen(port, () => {
  console.log(`attendance-task-server http://localhost:${port}`);
});
