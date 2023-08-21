// Usual Express and Socket.IO stuff
require("dotenv").config();
require("./database/conn");
const bcrypt = require("bcrypt");
const express = require("express");
let favicon = require("serve-favicon");
const app = express();
const http = require("http");
const cookieParser = require("cookie-parser");
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const { requireauth } = require("./middleware/auth");
const jwt = require("jsonwebtoken");
const Message = require("./database/registers");
const User = require("./database/signupschema");

const { timeEnd } = require("console");
const nodemailer = require("nodemailer");
// Load external styles and scripts from folder 'public'
app.use(express.static("public"));
app.use(express.json());
app.use(cookieParser());
/******************************************************************************************/
const port = process.env.PORT || 8080;
let users = [];
let err1 = { email: "", password: "" };
let userentered;
let useremail;
let user1;

/****************************************************************************************/
const getmessages = async (socket) => {
  const result = await Message.find().sort({ _id: 1 });
  socket.emit("output", { result: result, useremail: useremail });
};
const storemessage = async (user_name, msg, mail, time) => {
  const message = new Message({
    name: user_name,
    message: msg,
    email: mail,
    time: time,
  });
  await message.save();
};

const handlerror = (err) => {
  let errors = { email: "", password: "" };

  if (err.code === 11000) {
    errors.email = "email already exist";
    return errors;
  }
  if (err.message.includes("user validation failed")) {
    Object.values(err.errors).forEach(({ properties }) => {
      errors[properties.path] = properties.message;
    });
  }
  return errors;
};
const maxAge = 3 * 24 * 60 * 60;
const createtoken = (id) => {
  return jwt.sign({ id }, "ankitgarg", {
    expiresIn: maxAge,
  });
};

const checkuser = (req, res, next) => {
  const token = req.cookies.login;
  if (token) {
    jwt.verify(token, "ankitgarg", async (err, decodedToken) => {
      if (err) {
        user1 = null;
        next();
      } else {
        console.log(decodedToken);
        let user = await User.findById(decodedToken.id);
        console.log(user);
        user1 = user;
        next();
      }
    });
  } else {
    user1 = null;
    next();
  }
};
/*******************************************************************************************/

//to serve favicon
app.use(favicon(__dirname + "/public/img/favicon.ico"));

// Serve the main file
app.get("*", checkuser);
app.get("/", requireauth, (req, res) => {
  userentered = user1.username;
  useremail = user1.email;
  res.sendFile(__dirname + "/views/index.html");
});

app.get("/ui", requireauth, (req, res) => {
  userentered = user1.username;
  useremail = user1.email;
  res.sendFile(__dirname + "/tmp/old.index.html");
});

//handling signup
app.get("/signup", (req, res) => {
  res.sendFile(__dirname + "/views/signup.html");
});

//handling sign post request
app.post("/signup", async (req, res) => {
  try {
    console.log(req.body);
    if (req.body.password === req.body.conpassword) {
      const user = new User({
        username: req.body.username,
        email: req.body.email,
        password: req.body.password,
      });
      await user.save();

      res.status(201).json({ user: user._id });
    } else {
      throw "Password does not matches";
    }
  } catch (err) {
    if (err != "Password does not matches") {
      err1 = handlerror(err);
    }
    if (err == "Password does not matches" && err1.password == "") {
      if (err1.email != "email already exist") {
        err1.password = "Password does not matches";
      }
    }

    console.log(err1);
    let error = { ...err1 };
    err1.password = "";
    err1.email = "";
    res.status(400).json({ error });
  }
});

//handling login

app.get("/login", (req, res) => {
  res.sendFile(__dirname + "/views/login.html");
});

app.post("/login", async (req, res) => {
  try {
    const user = await User.findOne({ email: req.body.email });
    if (!user) {
      console.log("inside error block");
      throw "Invalid Email";
    }

    if (user) {
      const auth = await bcrypt.compare(req.body.password, user.password);

      if (auth) {
        const token = createtoken(user._id);
        res.cookie("login", token, { httpOnly: true, maxAge: maxAge * 1000 });

        res.status(200).json({ user: user._id });
      } else {
        throw Error("Incorrect Password");
      }
    }
  } catch (err) {
    if (err == "Invalid Email") {
      err1.email = "Email not registered";
    } else {
      err1.password = "Incorrect Password";
    }

    let error = { ...err1 };
    err1.password = "";
    err1.email = "";
    console.log(error);
    res.status(400).json({ error });
  }
});

app.post("/otp", async (req, res) => {
  try {
    const user = await User.findOne({ email: req.body.email });
    if (!user) {
      throw "Invalid Email";
    } else {
      var email;

      let transporter = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        service: "Gmail",

        auth: {
          user: process.env.EMAIL,
          pass: process.env.PASSWORD,
        },
      });
      let otp = Math.random();
      otp = otp * 1000000;
      otp = parseInt(otp);
      console.log(otp);

      // send mail with defined transport object
      var mailOptions = {
        from: process.env.EMAIL,
        to: req.body.email,
        subject: "Reset Password OTP | ChatApp",
        text: `Hello user,\nYour OTP is : ${otp}\nEnter this code within 1 hour to login to your account if you have forgotten your password or go to the login page to resend it. If you do not recognize or expect this mail, please do not share the above OTP with anyone.\n\nchatApp`,
      };

      transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
          return console.log(error);
        } else {
          console.log("done");
        }
      });

      res.json({ otp });
    }
  } catch (err) {
    let error = { email: "" };
    if (err === "Invalid Email") {
      error.email = "Invalid Email";
    }

    res.status(400).json({ error });
  }
});
app.get("/forgotpassword", (req, res) => {
  res.sendFile(__dirname + "/views/fpassword.html");
});

app.post("/forgotpassword", async (req, res) => {
  try {
    console.log(req.body.otp, parseInt(req.body.userotp));
    if (req.body.otp != parseInt(req.body.userotp)) {
      throw "Invalid Otp";
    } else {
      console.log("noerror");
      if (req.body.password === req.body.conpassword) {
        if (req.body.password.length >= 6) {
          const salt = await bcrypt.genSalt();
          let password = await bcrypt.hash(req.body.password, salt);
          const user = await User.updateOne(
            { email: req.body.email },
            { $set: { password: password } }
          );
          res.status(201).json({ user: user._id });
        } else {
          throw "Minimum length should be 6 character";
        }
      } else {
        throw "Password does not matches";
      }
    }
  } catch (err) {
    let error = { password: "", otpmessage: "" };
    if (err === "Invalid Otp") {
      error.otpmessage = "Invalid Otp";
    } else if (err === "Password does not matches") {
      error.password = "Password does not matches";
    } else if (err === "Minimum length should be 6 character") {
      error.password = "Minimum length should be 6 character";
    }
    res.status(400).json({ error });
  }
});
// Serve list of users
app.get("/users", (req, res) => {
  res.send(users);
});

app.get("/me", (req, res) => {
  res.send(user1);
});

app.get("/messages", async (req, res) => {
  const result = await Message.find();
  res.send(result);
});

app.get("/logout", (req, res) => {
  res.cookie("login", "", { maxAge: 1 });
  res.redirect("/login");
});

/***************************************************************************************************** */

// When a connection is received
io.on("connection", (socket) => {
  if (user1) {
    console.log("A user has connected");
    io.emit("connected", {
      id: socket.id,
      name: userentered,
      email: useremail,
    });
    getmessages(socket);

    socket.name = "";
    let filtered_users = users.filter((user) => user.id == socket.id);
    if (filtered_users != []) {
      users.push({
        name: userentered,
        id: socket.id,
        email: useremail,
      });
    }

    // Receiving a chat message from client
    socket.on("mychat message", (msg, time) => {
      console.log("Received a chat message");
      let current_user = users.filter((user) => user.id === socket.id);
      const mail = current_user[0].email;
      const name = current_user[0].name;
      socket.name = name;

      let userList = [];
      if (msg.substr(0, 3) == "/w ") {
        msg = msg.substr(3);
        const idx = msg.indexOf(" ");

        if (idx != -1) {
          const toUsername = msg.substr(0, idx);
          msg = msg.substr(idx + 1);
          userList = users.filter((_user_) => _user_.name === toUsername);
        }
      }

      if (userList.length)
        userList.forEach((user) =>
          io
            .to(socket.id)
            .to(user.id)
            .emit(
              "chat message",
              { name: socket.name, id: socket.id },
              msg,
              time,
              user
            )
        );
      else
        io.emit(
          "chat message",
          { name: socket.name, id: socket.id },
          msg,
          time,
          "null"
        );

      storemessage(name, msg, mail, time);
    });

    // Received when some client is typing
    socket.on("typing", (user) => {
      socket.broadcast.emit("typing", user);
    });
    // Receiving an image file from client
    socket.on("base64_file", function (msg, time) {
      let current_user = users.filter((user) => user.id === socket.id);
      const name = current_user[0].name;
      socket.name = name;
      console.log(`received base64 file from ${socket.name}`);
      var data = {};
      data.fileName = msg.fileName;
      data.file = msg.file;
      data.id = socket.id;
      data.username = socket.name == "" ? "Anonymous" : socket.name;
      io.sockets.emit("base64_file", data, time);
    });
    // Sent to all clients when a socket is disconnected
    socket.on("disconnect", () => {
      console.log("A user has disconnected");
      users = users.filter((user) => user.id !== socket.id);
      io.emit("disconnected", socket.id);
    });
  }
});

server.listen(port, () => {
  console.log("Listening on:", port);
});
