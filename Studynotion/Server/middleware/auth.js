const jwt = require("jsonwebtoken")
require("dotenv").config()
const User = require("../models/User")

// auth
exports.auth = async(req, res, next) => {
    try {
        // extract token 
        const token = req.cookie.token || req.body.token || req.header("Authorization").replace("Bearer", "")
        // if token missing , the return response
        if(!token){
            return res.status(401).json({
                success:false,
                message:"Token is missing",
            })
        }

        // verify the token -> secret 
        try {
            const decode = jwt.verify(token, process.env.JWT_SECRET)
            console.log(decode)
            req.user = decode
        } catch (err) {
            // verification issue
            return res.status(401).json({
                success:false,
                message:"Token is invalid"
            })
        } 
        next()
    } catch (error) {
        return res.status(401).json({
            success:false,
            message:"Something went wrong, while validating the token"
        })
    }
}

// is student
exports.isStudent = async (req, res) => {
    try {
        if(req.user.accountType != "Student"){
            return res.status(401).json({
                success:false,
                message:"This is a protected route for Student only",
            })
        }
        next()
    } catch (error) {
        return res.status(500).json({
            success:false,
            message:"User role cannot be verified",
        })
    }
}

// is Instructor
exports.isInstructor = async (req, res) => {
    try {
        if(req.user.accountType != "Instructor"){
            return res.status(401).json({
                success:false,
                message:"This is a protected route for Instructor only"
            })
        }
        next()
    } catch (error) {
        // console.log(error)
        return res.status(500).json({
            success:false,
            message:"User role cannot be verified, please try again latter"
        })
    }
}

// isAdmin
exports.isAdmin = async (req, res) => {
    try {
        if(req.user.accountType != "Admin"){
            return res.status(401).json({
                success:false,
                message:"This is a protected route for Admin only"
            })
        }
        next()
    } catch (error) {
        return res.status(500).json({
            success:false,
            message:"User role cannot be verified, please try again latter"
        })
    }
}