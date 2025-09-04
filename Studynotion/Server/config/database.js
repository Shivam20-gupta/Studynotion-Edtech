const mongoose = require("mongoose")
require("dotenv").config()

exports.connect = () => {
    mongoose.connect(process.env.DATABASE_URI, {
        useNewUrlParser:true,
        useUnifiedTopology:true,
    })
    .then(() => console.log("DataBase connected sucessfully"))
    .catch((error) => {
        console.log("Error in db connection")
        console.log(error)
        process.exit(1)
    })
}