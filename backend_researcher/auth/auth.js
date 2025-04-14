import express from 'express'
import { supabase } from '../supabase/supabase';

const router = express.Router


router.post('/auth/register', async (res, req) => {
    const {
        student_email,
        student_password,
        student_major,
        student_firstName,
        student_lastName,
        student_year,
        student_acceptedTerms,
      } = req.body;
    
      try {
        const { data, session, error: authError } = await supabase.auth.signUp({
          email: student_email,
          password: student_password,
          options: {
            data: {
              first_name: student_firstName,
              last_name: student_lastName,
              major: student_major,
              year: student_year,
              accepted_terms: student_acceptedTerms
            },
          },
        });
    
        if (authError) {
          return res.status(400).json({ message: authError.message, session: session });
        }

        return res.status(200).json({ data: data });
      } catch (error) {
        return res.status(500).json({ message: error });
      }
})

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

