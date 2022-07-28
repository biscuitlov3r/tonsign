const express = require("express");
const bodyparser = require("body-parser");
const TonWeb = require("tonweb");
const sqlite = require("sqlite3");
const jsSHA = require("jssha");
const hbs = require("handlebars");
const fs = require("fs");
const multer = require("multer");
const path = require("path");

app = express();

app.use(
    bodyparser.urlencoded({
        extended: true,
    })
);

app.set("view engine", "hbs");
app.set("views", __dirname + "/templates");

app.use(express.static(__dirname + "/public"));
app.use(express.static(__dirname + "/uploads"));

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, "uploads/");
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname));
    },
});
const upload = multer({ storage: storage });

const config = JSON.parse(fs.readFileSync("config.json"));

const tonweb = new TonWeb(
    new TonWeb.HttpProvider("https://toncenter.com/api/v2/jsonRPC", {
        apiKey: config.apikey,
    })
);

async function createPetition(title, description, image, author) {
    let db = new sqlite.Database("database.db");

    let promise = new Promise((resolve, reject) => {
        db.all(
            "SELECT * FROM petitions WHERE title=? AND description=? AND image=? AND author=?",
            [title, description, image, author],
            (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            }
        );
    });

    let check = await promise;

    if (check.length > 0) {
        return "petition already exists";
    }

    let promise2 = new Promise((resolve, reject) => {
        db.run(
            "INSERT INTO petitions(title, description, image, author) VALUES(?,?,?,?)",
            [title, description, image, author],
            (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve("success");
                }
            }
        );
    });
    let status = await promise2;

    if (status == "success") {
        let promise = new Promise((resolve, reject) => {
            db.all(
                "SELECT * FROM petitions WHERE title=? AND description=? AND image=? AND author=?",
                [title, description, image, author],
                (err, rows) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(rows[0]);
                    }
                }
            );
        });
        let petition = await promise;
        return petition.id;
    }
}
async function getPetition(id) {
    let db = new sqlite.Database("database.db");

    let promise = new Promise((resolve, reject) => {
        db.all("SELECT * FROM petitions WHERE id=?", [id], (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });

    let check = await promise;
    if (check.length > 0) {
        return check[0];
    } else {
        return "not found";
    }
}
async function getSignatures(id) {
    let petition = await getPetition(id);
    ok = false;
    while (ok == false) {
        try {
            transactions = await tonweb.getTransactions(
                petition.author,
                (limit = 1500000)
            );
            ok = true;
        } catch {
            ok = false;
        }
    }

    let signatures = [];
    let addresses = [];

    for (transaction of transactions) {
        if (transaction.in_msg.message.startsWith("petition")) {
            try {
                signature = JSON.parse(
                    transaction.in_msg.message.replace("petition", "")
                );
            } catch (err) {
                continue;
            }

            function b64_to_utf8(str) {
                return decodeURIComponent(escape(atob(str)));
            }
            try {
                signature.comment = b64_to_utf8(signature.comment);
                signature.full_name = b64_to_utf8(signature.full_name);
            } catch {
                continue;
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
                    });
                    addresses.push(transaction.in_msg.source);
                }
            }
        }
    }
    return signatures;
}

app.post("/createPetition", (req, res) => {
    createPetition(
        req.body.title,
        req.body.description,
        req.body.image,
        req.body.author
    ).then((status) => {
        res.send({ data: status });
    });
});
app.get("/p/:id", (req, res) => {
    getPetition(req.params.id).then((petition) => {
        if (petition != "not found") {
            getSignatures(req.params.id).then((signatures) => {
                res.render("petition.hbs", {
                    petition: petition,
                    count: signatures.length,
                });
            });
        } else {
            res.sendFile(__dirname + "/pages/404.html");
        }
    });
});
app.get("/signatures/:id", (req, res) => {
    getPetition(req.params.id).then((petition) => {
        if (petition != "not found") {
            getSignatures(req.params.id).then((signatures) => {
                res.render("signatures.hbs", {
                    petition: petition,
                    count: signatures.length,
                    signatures: signatures,
                });
            });
        } else {
            res.sendFile(__dirname + "/pages/404.html");
        }
    });
});
app.get("/", (req, res) => {
    res.sendFile(__dirname + "/pages/index.html");
});
app.get("/create", (req, res) => {
    res.sendFile(__dirname + "/pages/create.html");
});

app.post("/upload", upload.single("filedata"), function (req, res, next) {
    let filedata = req.file;

    if (!filedata) {
        res.send({ status: "error" });
    } else {
        res.send({ status: "success", file: filedata.filename });
    }
});
app.get("*", (req, res) => {
    res.sendFile(__dirname + "/pages/404.html");
});

app.listen(3000);
