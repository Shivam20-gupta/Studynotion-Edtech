const { instance } = require("../config/razorpay")
const Course = require("../models/Course")
const crypto = require("crypto")
const User = require("../models/User")
const mailSender = require("../utils/mailSender")
const mongoose = require("mongoose")
const {courseEnrollmentEmail} = require("../mails/templates/courseEnrollmentEmail")
const { paymentSuccessEmail } = require("../mails/templates/paymentSuccessfullEmail")
const CourseProgress = require("../models/CourseProgress")

// capture the payment and create an razorpay order-> only for creatiing payments
exports.capturePayment = async (req, res) => {
    try {
        // get course id and user id
        const {courseId} = req.body
        const userId = req.user.id

        // validation
        // valid course id
        if(!courseId) {
            return res.json({
                success:false,
                message:"Please provide valid course id",
            })
        }

        // valid course details
        let course;
        try {
            course = await Course.findById(courseId);
            if(!course){
                return res.json({
                    success:false,
                    message:"Could not find the course",
                })
            }
            // user already pay for same course
            const uid = new mongoose.Types.ObjectId(userId)
            if(course.studentsEnrolled.includes(uid)){
                return res.status(200).json({
                    success:false,
                    message:"Student is already enrolled",
                })
            }
        } catch (error) {
            console.log(error)
            return res.status(500).json({
                success:false,
                message:error.message,
            })
        }
        // order create
        const amount = course.price
        const currency = "INR"

        const options ={
            amount: amount*100,
            currency:currency,
            recipt:Math.random(Date.now()).toString(),
            notes:{
                courseID: courseId,
                userId,
            }
        }

        try {
            // initiate the payment using razorpay
            const paymentResponse = await instance.orders.create(options);
            console.log(paymentResponse)
            // return response
            return res.status(200).json({
                success:true,
                courseName:course.courseName,
                courseDescription:course.courseDescription,
                thumbnail : course.thumbnail,
                orderId:paymentResponse.id,
                currency:paymentResponse.currency,
                amount:paymentResponse.amount,
            })
        } catch (error) {
            console.log(error)
            return res.json({
                success:false,
                message:"could not initiate order",
            })
        }
        // return response
    } catch (error) {
        
    }
}

// verify signature
exports.verifySignature = async (req, res) => {
    // is handler function m hum server k andar pada secret aur razor pay k andar pada secret match krenge jo hume btayega ki humari payment puri hogyi ya nhi
    const webhookSecret = "12345678"

    // razorpay ka secret headers k andr send hota h aur x-razorpay-signature k sath send hoti hai
    // razorpay n jo secret key bhji h vo hashed krke bhji h for security purpose
    // hum uski ki decrypt krne ki vjha hum apki webhook key ko encrypt krke match krvayenge
    const signature = req.header["x-razorpay-signature"]

    // ye create hmac apka webhook encrypt krega
    // hmac combination h tumhare hashung algorithm aur secret key ka
    // yha hume ye donoo cheej btani pdengi
    // checksum pdhna h
    // sha humara ek hashing algorithm h iske alawa koi hashing algo ki jrurt nhi pdegi

    const shasum = crypto.createHmac("sha256", webhookSecret)
    // ye string format m convert hojayega 
    shasum.update(JSON.stringify(req.body))
    //  jo humara output aata h usko hum digest bolte h ye basically hexadecimal format m hota hai
    const digest = shasum.digest("hex")

    // abb hum isko match krenge
    if(signature === digest){
        console.log("Payment is authorized")
        // abb humare user n payment krdi hai toh abb user m course id daal do aur course m studentenrolled m user id daal do
        // abb ye request humare frontend se nhi razorpay se aayi hai toh abb notes se userid aur course id nikalo
        // abb notes se user id nikalenge console log krke hume path pta lgg jayega
        // req.body.payload.payment.entity -> ye path hume console log krke pta lga

        const {userId, courseId} = req.body.payload.payment.entity.notes

        try {
            // fulfil the acction student ko enroll kro
            // find the student and enroll him
            const enrolledCourse = await Course.findOne(
                {_id:courseId},
                {$push:{studentsEnrolled:userId}},
                {new:true},
            )

            if(!enrolledCourse){
                return res.status(500).json({
                    success:false,
                    message:"Course not found",
                })
            }

            console.log(enrolledCourse)

            // find the student and update course
            const enrolledStudent = await User.findOne(
                {_id:userId},
                {$push:{courses:courseId}},
                {new:true},
            )

            console.log(enrolledStudent)

            // mail send krdo user ko ki tumhara course successfully tumhara hogya
            // isko template se attach krna pdega
            const emailResponse = await mailSender(enrolledStudent.email, 
                "Congratulations",
                "Congratulation , you are on boarded into new Study notion course",
            )

            // return response
            return res.status(200).json({
                success:true,
                message:"Signature verified and course added"
            })
        } catch (error) {
            console.log(error)
            return res.status(500).json({
                success:false,
                message:error.message,
            })
        }
    }else{
        return res.status(400).json({
            success:false,
            message:"Invalid request",
        })
    }
}

exports.sendPaymentSuccessEmail = async (req, res) => {
  const { orderId, paymentId, amount } = req.body

  const userId = req.user.id

  if (!orderId || !paymentId || !amount || !userId) {
    return res
      .status(400)
      .json({ success: false, message: "Please provide all the details" })
  }

  try {
    const enrolledStudent = await User.findById(userId)

    await mailSender(
      enrolledStudent.email,
      `Payment Received`,
      paymentSuccessEmail(
        `${enrolledStudent.firstName} ${enrolledStudent.lastName}`,
        amount / 100,
        orderId,
        paymentId
      )
    )
  } catch (error) {
    console.log("error in sending mail", error)
    return res
      .status(400)
      .json({ success: false, message: "Could not send email" })
  }
}

// enroll the student in the courses
const enrollStudents = async (courses, userId, res) => {
  if (!courses || !userId) {
    return res
      .status(400)
      .json({ success: false, message: "Please Provide Course ID and User ID" })
  }

  for (const courseId of courses) {
    try {
      // Find the course and enroll the student in it
      const enrolledCourse = await Course.findOneAndUpdate(
        { _id: courseId },
        { $push: { studentsEnroled: userId } },
        { new: true }
      )

      if (!enrolledCourse) {
        return res
          .status(500)
          .json({ success: false, error: "Course not found" })
      }
      console.log("Updated course: ", enrolledCourse)

      const courseProgress = await CourseProgress.create({
        courseID: courseId,
        userId: userId,
        completedVideos: [],
      })
      // Find the student and add the course to their list of enrolled courses
      const enrolledStudent = await User.findByIdAndUpdate(
        userId,
        {
          $push: {
            courses: courseId,
            courseProgress: courseProgress._id,
          },
        },
        { new: true }
      )

      console.log("Enrolled student: ", enrolledStudent)
      // Send an email notification to the enrolled student
      const emailResponse = await mailSender(
        enrolledStudent.email,
        `Successfully Enrolled into ${enrolledCourse.courseName}`,
        courseEnrollmentEmail(
          enrolledCourse.courseName,
          `${enrolledStudent.firstName} ${enrolledStudent.lastName}`
        )
      )

      console.log("Email sent successfully: ", emailResponse.response)
    } catch (error) {
      console.log(error)
      return res.status(400).json({ success: false, error: error.message })
    }
  }
}