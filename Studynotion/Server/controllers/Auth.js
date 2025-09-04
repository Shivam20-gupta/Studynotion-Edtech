const bcrypt = require("bcrypt")
const User = require("../models/User")
const OTP = require("../models/OTP")
const jwt = require("jsonwebtoken")
const otpGenerator = require("otp-generator")
const mailSender = require("../utils/mailSender")
const{passwordUpdated} = require("../mails/templates/passwordUpdate")
const Profile = require("../models/Profile")
require("dotenv").config()
const cookie = require("cookie-parser")

exports.sendOTP = async (req, res) =>{
    try{
    // fetch email from req ki body
    const {email} = req.body

    // check if user already exist
     const checkUserPresent = await User.findOne({email})

    //   agar user present hai toh ek valid response bhj do
    if(checkUserPresent){
        return res.status(401).json({
            success:false,
            message:"User alreay exist",
        })
    }

    // generate otp
    var otp = otpGenerator.generate({
        upperCaseAlphabet:false,
        lowerCaseAlphabet:false,
        specialChars:false,
    })
    console.log("OTP generator", otp)

    // check weather unique otp aur not
    const result = await OTP.findOne({otp: otp})

    while(result){
        otp = otpGenerator(6, {
        upperCaseAlphabet:false,
        lowerCaseAlphabet:false,
        specialChars:false,
    })
    const result = await OTP.findOne({otp: otp})
    }

    const otpPayload = {email, otp}
    // create an entry in db for otp

    const otpBody = await OTP.create(otpPayload)
    console.log(otpBody)

    // return response 
    res.status(200).json({
        success:true,
        message:"OTP sent successfully",
        otp,
    })

    }catch(error){
        console.log(error)
        return res.status(500).json({
            success:false,
            message:error.message
        })
    }
}

// code for sign up

exports.signUp = async (req, res) => {
    try{
    // fetch dat afrom req ki body
    const {firstName, lastName, email, password, confirmPassword, accountType, contactNumer, otp} = req.body
    
    // validate krlo
    if(!firstName || !lastName || !email || !password || !confirmPassword || !otp){
        return res.status(403).json({
            success:false,
            message:"All feilds are required",
        })
    }

    // 2no password match krlo
    if(password !== confirmPassword){
        return res.status(400).json({
            success:false,
            message:"Password dosen't match, Please try again"
        })
    }

    // check user exist or not
    const existingUser = await User.findOne({email})
    if(existingUser){
        return res.status(400).json({
            success:false,
            message:"User already exist"
        })
    }

    // find most recent otp 
    const recentOTP = await OTP.find({email}).sort({createdAt:-1}).limit(1);
    console.log("Recent otp is ",recentOTP)
    // validate otp
    if(recentOTP.length == 0){
        return res.status(400).json({
            success:false,
            message:"OTP not found"
        })
    } else if(otp !== recentOTP[0].otp){
        // Invalid Otp
        return res.status(400).json({
            success:false,
            message:"Invalid Otp",
        })
    }

    // hash krlo pass word 
    const hashedPassword = await bcrypt.hash(password, 10)

    // entry create krlo db m
    // additional detail k andar humne profile object id daali hai toh hume profile bnanu pdegi kyuki humari object id object bnane k baad hi milegi
    const profileDetails = await Profile.create({
        gender:null,
        dateOfBirth:null,
        about:null,
        contactNumber:null,
    })

    const user = await User.create({
        firstName,
        lastName,
        email,
        contactNumer,
        password:hashedPassword,
        accountType:accountType,
        approved:approved,
        additionalDetails:profileDetails._id,
        image:`https://api.dicebear.com/5.x/initials/svg?seed=${firstName} ${lastName}`,
    })

    // res send krdo
    return res.status(200).json({
        success:true,
        message:"User registered successfully",
        user,
    })
} catch(error){
    console.log(error)
    return res.status(500).json({
        success:false,
        message:"User not registered, Please try again later",
    })
}
}

// code for login 
exports.login = async (req, res) => {
    try {
        // get data from req body
        const {email, password} = req.body

        // validate kro
        if(!email || !password){
            return res.status(403).json({
                success:false,
                message:"Feilds cannot be empty"
            })
        }

        // user exist or not check
        const user = await User.findOne({email}).populate("additionalDetails")
        if(!user){
            return res.status(401).json({
                success:false,
                message:"User not registered, Please Sign Up first"
            })
        }
        // Generate jwt token, after password matched
        if(await bcrypt.compare(password, user.password)){
            const payload = {
                email:user.email,
                id:user._id,
                accountType:user.accountType,
            }
            const token = jwt.sign(payload, process.env.JWT_SECRET, {
                expiresIn:"2h",
            })
            user.token = token
            user.password = undefined

            // create cookiee  phli entry m cookie ka nam aata h, dusra cookie ki value, 3rd m options
            const options = {
                expiresIn: new Date(Date.now() + 3*24*60*60*1000),
                httpOnly:true,
            }

            res.cookie("Token", token, options).status(200).json({
                success:true,
                token,
                user,
                message:"Logged in",
            })
        }
        else{
            return res.status(401).json({
                success:false,
                message:"Password is incorrect"
            })
        }
        
        // send response
    } catch (error) {
        console.log(error)
        return res.status(500).json({
            success:false,
            message:"Login Faliure, please try again later",
        })
    }
}

// change password
exports.changePassword = async (req, res) => {
  try {
    // Get user data from req.user
    const userDetails = await User.findById(req.user.id)

    // Get old password, new password, and confirm new password from req.body
    const { oldPassword, newPassword } = req.body

    // Validate old password
    const isPasswordMatch = await bcrypt.compare(
      oldPassword,
      userDetails.password
    )
    if (!isPasswordMatch) {
      // If old password does not match, return a 401 (Unauthorized) error
      return res
        .status(401)
        .json({ success: false, message: "The password is incorrect" })
    }

    // Update password
    const encryptedPassword = await bcrypt.hash(newPassword, 10)
    const updatedUserDetails = await User.findByIdAndUpdate(
      req.user.id,
      { password: encryptedPassword },
      { new: true }
    )

    // Send notification email
    try {
      const emailResponse = await mailSender(
        updatedUserDetails.email,
        "Password for your account has been updated",
        passwordUpdated(
          updatedUserDetails.email,
          `Password updated successfully for ${updatedUserDetails.firstName} ${updatedUserDetails.lastName}`
        )
      )
      console.log("Email sent successfully:", emailResponse.response)
    } catch (error) {
      // If there's an error sending the email, log the error and return a 500 (Internal Server Error) error
      console.error("Error occurred while sending email:", error)
      return res.status(500).json({
        success: false,
        message: "Error occurred while sending email",
        error: error.message,
      })
    }

    // Return success response
    return res
      .status(200)
      .json({ success: true, message: "Password updated successfully" })
  } catch (error) {
    // If there's an error updating the password, log the error and return a 500 (Internal Server Error) error
    console.error("Error occurred while updating password:", error)
    return res.status(500).json({
      success: false,
      message: "Error occurred while updating password",
      error: error.message,
    })
  }
}