import express from 'express'
import { supabase } from '../supabase/supabase';

const router = express.Router


router.post('/auth/register', async (req, res) => {
  const {
    student_email,
    student_password,
    student_major,
    student_firstname,
    student_lastname,
    student_year,
    student_interests,
    student_acceptedterms,
  } = req.body;

  try {
    const { data: signUpData, error: authError } = await supabase.auth.signUp({
      email: student_email,
      password: student_password,
    });
    if (authError) {
      return res.status(400).json({ message: authError.message });
    }

    const userId = signUpData.user.id;  

    const { error: profileError } = await supabase
      .from("User_Profiles")
      .insert({
        user_id: userId,
        student_email: student_email,
        student_major: student_major,
        student_firstname: student_firstname,
        student_lastname: student_lastname,
        student_year: student_year,
        student_interests: student_interests,   
        student_acceptedterms: student_acceptedterms, 
      });


    if (profileError) {
      await supabase.auth.admin.deleteUser(userId);
      return res.status(400).json({ message: profileError.message });
    }

    return res.status(201).json({ user: signUpData.user });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});


router.post('/auth/login', async (req, res) => {
    const { email, password } = req.body;
    try {
      const { data, session, error: authError } = await supabase.auth.signInWithPassword({
        email: email,
        password: password
      });
      if (authError) {
        return res.status(400).json({ message: authError.message });
      }
      return res.status(200).json({data: data, session: session})
    } catch (error) {
      return res.status(500).json({ message: error });
    }
  });

  //Query the unique UUID instead
router.get('/get-user', async (req, res) => {
    const { email } = req.body
    try {
        const { data: {user}, error: authError} = await supabase.auth.getUser()
        if (authError) {
            return res.status(400).json({ message: error});
        }
        return res.status(200).json({data: user});

    } catch (error) {
        return res.status(500).json({ message: error });
    };
});

