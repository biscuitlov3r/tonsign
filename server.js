const express = require("express")
const bodyparser = require("body-parser")
const TonWeb = require("tonweb")
const sqlite = require("sqlite3")
const jsSHA = require("jssha")
const hbs = require("handlebars")
const fs = require("fs")
const multer = require("multer")
const path = require("path")
const axios = require("axios")

app = express()

app.use(
  bodyparser.urlencoded({
    extended: true,
  })
)

app.set("view engine", "hbs")
app.set("views", __dirname + "/templates")

app.use(express.static(__dirname + "/public"))

const whitelist = ["image/png", "image/jpeg", "image/jpg"]
const storage = multer.diskStorage({
  destination: __dirname + "/uploads",
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname))
  },
})
var upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (!whitelist.includes(file.mimetype)) {
      cb(null, false)
    } else {
      cb(null, true)
    }
  },
})

const config = JSON.parse(fs.readFileSync(__dirname + "/config.json"))

const tonweb = new TonWeb(
  new TonWeb.HttpProvider("https://toncenter.com/api/v2/jsonRPC", {
    apiKey: config.apikey,
  })
)

async function createPetition(title, description, image, author) {
  let db = new sqlite.Database(__dirname + "/database.db")

  let promise = new Promise((resolve, reject) => {
    db.all(
      "SELECT * FROM petitions WHERE title=? AND description=? AND image=? AND author=?",
      [title, description, image, author],
      (err, rows) => {
        if (err) {
          reject(err)
        } else {
          resolve(rows)
        }
      }
    )
  })

  let check = await promise

  if (check.length > 0) {
    return "petition already exists"
  }

  let promise2 = new Promise((resolve, reject) => {
    db.run(
      "INSERT INTO petitions(title, description, image, author) VALUES(?,?,?,?)",
      [title, description, image, author],
      (err) => {
        if (err) {
          reject(err)
        } else {
          resolve("success")
        }
      }
    )
  })
  let status = await promise2

  if (status == "success") {
    let promise = new Promise((resolve, reject) => {
      db.all(
        "SELECT * FROM petitions WHERE title=? AND description=? AND image=? AND author=?",
        [title, description, image, author],
        (err, rows) => {
          if (err) {
            reject(err)
          } else {
            resolve(rows[0])
          }
        }
      )
    })
    let petition = await promise
    return petition.id
  }
}
async function getPetition(id) {
  let db = new sqlite.Database(__dirname + "/database.db")

  let promise = new Promise((resolve, reject) => {
    db.all("SELECT * FROM petitions WHERE id=?", [id], (err, rows) => {
      if (err) {
        reject(err)
      } else {
        resolve(rows)
      }
    })
  })

  let check = await promise
  if (check.length > 0) {
    return check[0]
  } else {
    return "not found"
  }
}
async function getSignatures(id) {
  let petition
  if (typeof id == "object") {
    petition = id
  } else {
    petition = await getPetition(id)
  }
  let ok = false
  while (ok == false) {
    try {
      transactions = await tonweb.getTransactions(
        petition.author,
        (limit = 1500000)
      )
      ok = true
    } catch (err) {
      ok = false
      if (err == "Incorrect address") {
        return err
      }
    }
  }

  let signatures = []
  let addresses = []

  for (transaction of transactions) {
    if (transaction.in_msg.message.startsWith("petition")) {
      try {
        signature = JSON.parse(
          transaction.in_msg.message.replace("petition", "")
        )
      } catch (err) {
        continue
      }

      function b64_to_utf8(str) {
        return decodeURIComponent(escape(atob(str)))
      }
      try {
        signature.comment = b64_to_utf8(signature.comment)
        signature.full_name = b64_to_utf8(signature.full_name)
      } catch (err) {
        continue
      }

      if (signature.id == id) {
        if (
          addresses.indexOf(transaction.in_msg.source) == -1 &&
          transaction.in_msg.destination == petition.author
        ) {
          signatures.push({
            address: transaction.in_msg.source,
            data: signature,
            transaction_id: transaction.transaction_id,
          })
          addresses.push(transaction.in_msg.source)
        }
      }
    }
  }
  return signatures
}
async function checkWallet(address) {
  if (address == "" || address < 48 || address > 48) {
    return "uninitialized"
  }
  let ok = false
  let info
  while (ok == false) {
    try {
      info = await tonweb.provider.getWalletInfo(address)
      ok = true
    } catch {}
  }
  return info.account_state
}
function checkNodeURL(url) {
  let url_object = new URL(decodeURIComponent(url))
  console.log(url_object.hostname)
  console.log(url_object.protocol)
  let restricted_hosts = [
    "localhost",
    "127.0.0.1",
    "local",
    ".local",
    "127.",
    "192.",
  ]
  if (restricted_hosts.includes(decodeURIComponent(url_object.hostname))) {
    return false
  }
  for (i of restricted_hosts) {
    console.log(decodeURIComponent(url_object.hostname).indexOf(i) != -1, i)
    if (decodeURIComponent(url_object.hostname).indexOf(i) != -1) {
      return false
    }
  }
  console.log(1)
  if (!["http:", "https:"].includes(url_object.protocol)) {
    console.log(2)
    console.log(url_object.protocol)
    return false
  }
  return true
}

app.post("/createPetition", (req, res) => {
  // Incorrect address
  checkWallet(req.body.author).then((status) => {
    if (status == "uninitialized") {
      res.send({ data: status })
    } else {
      createPetition(
        req.body.title,
        req.body.description,
        req.body.image,
        req.body.author
      ).then((status) => {
        res.send({ data: status })
      })
    }
  })
})
app.get("/p/:id", (req, res) => {
  if (req.query.node) {
    if (!checkNodeURL(req.query.node)) {
      res.send({ status: "error", message: "Invalid url" })
    }
    axios
      .get(req.query.node + "/getp", {
        params: {
          id: req.params.id,
        },
      })
      .then(function (response) {
        if (response.data == "not found") {
          res.sendFile(__dirname + "/pages/404.html")
        }

        getSignatures(response.data.data).then((signatures) => {
          res.render("petition.hbs", {
            petition: response.data.data,
            count: signatures.length,
            node: req.query.node,
          })
        })
      })
      .catch(function (error) {
        res.send({
          status: "error",
          message: "Error when connecting to node",
        })
      })
  } else {
    getPetition(req.params.id).then((petition) => {
      if (petition != "not found") {
        getSignatures(req.params.id).then((signatures) => {
          res.render("petition.hbs", {
            petition: petition,
            count: signatures.length,
          })
        })
      } else {
        res.sendFile(__dirname + "/pages/404.html")
      }
    })
  }
})
app.get("/getp", (req, res) => {
  getPetition(req.query.id).then((petition) => {
    res.send({ status: "success", data: petition })
  })
})
app.get("/signatures/:id", (req, res) => {
  if (req.query.node) {
    if (!checkNodeURL(req.query.node)) {
      res.send({ status: "error", message: "Invalid url" })
    }
    axios
      .get(req.query.node + "/getp", {
        params: {
          id: req.params.id,
        },
      })
      .then(function (response) {
        if (response.data == "not found") {
          res.sendFile(__dirname + "/pages/404.html")
        }

        getSignatures(response.data.data).then((signatures) => {
          res.render("signatures.hbs", {
            petition: response.data.data,
            count: signatures.length,
            signatures: signatures,
          })
        })
      })
      .catch(function (error) {
        res.send({
          status: "error",
          message: "Error when connecting to node",
        })
      })
  } else {
    getPetition(req.params.id).then((petition) => {
      if (petition != "not found") {
        getSignatures(req.params.id).then((signatures) => {
          res.render("signatures.hbs", {
            petition: petition,
            count: signatures.length,
            signatures: signatures,
          })
        })
      } else {
        res.sendFile(__dirname + "/pages/404.html")
      }
    })
  }
})
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/pages/index.html")
})
app.get("/create", (req, res) => {
  res.sendFile(__dirname + "/pages/create.html")
})

app.post("/upload", upload.single("image"), async function (req, res, next) {
  let filedata = req.file

  if (!filedata) {
    res.send({ status: "error" })
  } else {
    res.send({ status: "success", file: filedata.filename })
  }
})
app.get("/uploads/:file", async function (req, res) {
  let file = req.params.file
  await fs.access(__dirname + "/uploads/" + file, function (cb) {
    console.log(cb)
    if (cb == null) {
      res.download(__dirname + "/uploads/" + file)
    } else {
      res.sendFile(__dirname + "/pages/404.html")
    }
  })
})

app.get("*", (req, res) => {
  res.sendFile(__dirname + "/pages/404.html")
})
app.listen(3000)
