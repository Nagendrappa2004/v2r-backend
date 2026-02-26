const express=require("express");
const router=express.Router();
const Contact=require("../models/Contact");

/* SAVE MESSAGE */
router.post("/",async(req,res)=>{
  try{
    const msg=new Contact(req.body);
    await msg.save();
    res.json({message:"Saved"});
  }catch(err){
    res.status(500).json({error:"Failed"});
  }
});

/* ADMIN GET ALL */
router.get("/",async(req,res)=>{
  const data=await Contact.find().sort({date:-1});
  res.json(data);
});

module.exports=router;