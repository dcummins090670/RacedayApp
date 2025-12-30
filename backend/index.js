require ('dotenv').config();
const express  = require('express');
const cors  = require ('cors');
const app = express();

const mysql  = require('mysql2');
//import users from "./user.js"
//const users = require('./user');
const db = require('./config/db');

const allowedOrigins = [
  "http://localhost:3000", // Local dev
  "https://pitchapplicationapp.onrender.com", // Render frontend
];

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
  }
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  res.header("Access-Control-Allow-Credentials", "true");

  // Handle preflight (OPTIONS) requests immediately
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  next();
});

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
}));

app.use(express.json());


// Routes

const testRoute = require('./routes/testRoute');
app.use('/api', testRoute);

const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);

const fixtureRoutes = require('./routes/fixtures');
app.use('/api/fixtures', fixtureRoutes);

const returnsRoutes = require('./routes/hriReturns');
app.use('/api/hriReturns', returnsRoutes);

const userrRoutes = require('./routes/users');
app.use('/api/users', userrRoutes);

const pitchRoutes = require('./routes/pitches');
app.use('/api/pitches', pitchRoutes);

const premiumFixtureRoutes = require('./routes/premiumFixtures');
app.use('/api/premiumFixtures', premiumFixtureRoutes);

const corporateFixtureRoutes = require('./routes/corporateFixtures');
app.use('/api/corporateFixtures', corporateFixtureRoutes);




const PORT = process.env.PORT || 5000;
app.listen(5000, () => {
    console.log(`Server running on port ${PORT}`);
});






/*
    // TEST SAMPLE WITHOUT USING ROUTER
    app.get('/pitches', (req,res)=> {

        db.query ('Select * FROM pitch', (err, results) => {
            if (err) {
                return res.status(500).json({Error:err});
            }
                res.json(results);
        })
    })

    // add a simple test route to frontend using the user.js data:
    app.get('/api/user', (req, res) => {
        res.send(users)
    });

    // Example API route
    app.get("/api/hello", (req, res) => {
    res.json({ message: "Hello from backend!" });
    });

    // add a simple test route:
    app.get('/ping', (req, res) => {
        res.send('Server is pinging!');
    });

    // add a simple test route:
    app.get('/', (req, res) => {
        res.send('Server is ready!');
    });
*/