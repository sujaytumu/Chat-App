import { config } from "dotenv";
import { connectDB } from "../lib/db.js";
import User from "../models/user.model.js";
import bcrypt from "bcryptjs";

config();

// ✅ use map to hash each password before saving
const seedUsers = [
  //users
  {
    email: "globalstar@gmail.com",
    fullName: "ramcharan",
    password: "123456",
    profilePic: "https://res.cloudinary.com/dw6srh3vk/image/upload/v1755969923/RamCharan.jpg",
  },

  {
    email: "powerstar@gmail.com",
    fullName: "pawankalyan",
    password: "123456",
    profilePic: "https://res.cloudinary.com/dw6srh3vk/image/upload/v1755969939/pawankalyan.jpg",
  },

  {
    email: "iconstar@gmail.com",
    fullName: "alluarjun",
    password: "123456",
    profilePic: "https://res.cloudinary.com/dw6srh3vk/image/upload/v1755969949/alluarjun.jpg",
  },

  {
    email: "superstar@gmail.com",
    fullName: "maheshbabu",
    password: "123456",
    profilePic: "https://res.cloudinary.com/dw6srh3vk/image/upload/v1755972191/maheshbabu.jpg",
  },

  {
    email: "manofmasses@gmail.com",
    fullName: "ntr",
    password: "123456",
    profilePic: "https://res.cloudinary.com/dw6srh3vk/image/upload/v1755972198/ntr.jpg",
  },

  {
    email: "rebelstar@gmail.com",
    fullName: "prabhas",
    password: "123456",
    profilePic: "https://res.cloudinary.com/dw6srh3vk/image/upload/v1755972208/prabhas.jpg",
  },

  {
    email: "energeticstar@gmail.com",
    fullName: "ram",
    password: "123456",
    profilePic: "https://res.cloudinary.com/dw6srh3vk/image/upload/v1756019715/ram.jpg",
  },

  {
    email: "rowdystar@gmail.com",
    fullName: "vijay",
    password: "123456",
    profilePic: "https://res.cloudinary.com/dw6srh3vk/image/upload/v1756019737/vijay.jpg",
  },

  {
    email: "yuvasamrat@gmail.com",
    fullName: "nagachaitanya",
    password: "123456",
    profilePic: "https://res.cloudinary.com/dw6srh3vk/image/upload/v1756019782/nagachaitanya.jpg",
  },

  {
    email: "naturalstar@gmail.com",
    fullName: "nani",
    password: "123456",
    profilePic: "https://res.cloudinary.com/dw6srh3vk/image/upload/v1756019751/nani.jpg",
  },
  
];

const seedDatabase = async () => {
  try {
    await connectDB();

     // ✅ hash passwords before inserting
    const usersWithHashedPw = await Promise.all(
      seedUsers.map(async (user) => {
        const hashedPw = await bcrypt.hash(user.password, 10);
        return { ...user, password: hashedPw };
      })
    );

    // ✅ insert hashed users
    await User.insertMany(usersWithHashedPw);
    //await User.insertMany(seedUsers);
    
    console.log("Database seeded successfully");
  } catch (error) {
    console.error("Error seeding database:", error);
  }
};

// Call the function
seedDatabase();
