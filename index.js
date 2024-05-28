const express = require("express");
const app = express();
const mysql = require("mysql");
const session = require("express-session");
const path = require("path");
const bodyParser = require('body-parser');
const dashboardRoutes = require('./dashboard');

// DB connection setup
const connection = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "",
  database: "project",
});

// Set up middleware
app.use(express.static("views"));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
  secret: "secret",
  resave: true,
  saveUninitialized: true
}));

// Set EJS as the view engine
app.set('view engine', 'ejs');

app.use(session({
  secret: 'your_secret_key',
  resave: false,
  saveUninitialized: true,
  cookie: {
    expires: new Date(Date.now() + 3600000), // expire after 1 hour (in milliseconds)
    maxAge: 3600000 // session max age in milliseconds (optional, equivalent to expires)
  }
}));
// Routes
app.get("/", function (req, res) {
  res.render('index', { errorMessage: '' });
});

app.post("/register", function (req, res) {
  const { username, email, password } = req.body;

  const userData = {
    username: username,
    password: password,
    email: email,
  };

  if (username && password && email) {
    connection.query(
      "SELECT * FROM users WHERE email = ?",
      [email],
      function (error, results, fields) {
        if (error) {
          console.error(error);
          return res.status(500).send("Internal Server Error");
        }

        if (results.length > 0) {
          return res.render('index', { errorMessage: 'User already exists.' });
        } else {
          connection.query(
            "INSERT INTO users SET ?",
            userData,
            function (error, results, fields) {
              if (error) {
                console.error(error);
                return res.status(500).send("Internal Server Error");
              }
              req.session.loggedin = true;
              req.session.email = email;
              req.session.userId = results?.insertId;
              return res.redirect('/dashboard');
            }
          );
        }
      }
    );
  } else {
    res.send("Please enter Username, Email, and Password!");
  }
});

app.post("/auth", function (req, res) {
  const { email, password } = req.body;
  if (email && password) {
    connection.query(
      "SELECT * FROM users WHERE email = ? AND password = ?",
      [email, password],
      function (error, results, fields) {
        if (error) {
          console.error(error);
          return res.status(500).send("Internal Server Error");
        }
        if (results.length > 0) {
          req.session.loggedin = true;
          req.session.email = email;
          req.session.userId = results[0].id; // Assuming the user ID is stored in the 'id' field
          return res.redirect('/dashboard');
        } else {
          return res.render('index', { errorMessage: 'Incorrect email or password.' });
        }
      }
    );
  } else {
    res.send("Please enter Email and Password!");
  }
});

// Apply authenticate middleware to dashboard routes
app.use('/', dashboardRoutes);

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
app.get('/dashboard', function (request, response) {
  console.log("successfully redirect to dashboard")
  response.render('dashboard', { errorMessage: '' });
});


// Add this route handler for logout
app.post("/logout", function (req, res) {
  // Destroy the session
  req.session.destroy(function (err) {
    if (err) {
      console.error(err);
      return res.status(500).send("Internal Server Error");
    }
    // Redirect the user to the login page after logout
    res.redirect("/");
  });
});
