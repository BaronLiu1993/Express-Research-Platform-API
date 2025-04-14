import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
const port = 8080;

app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);


//Temporary Endpoints Make Modular

app.post('/auth/register', async (req, res) => {
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
    const { data, error } = await supabase.auth.signUp({
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

    if (error) {
      console.error('SignUp Error:', error);
      return res.status(400).json({ message: error.message });
    }
    return res.status(200).json({ data });

  } catch (error) {
    console.error('Error during registration:', error);
    return res.status(500).json({ message: 'An error occurred' });
  }
});

app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const { data, session, error: authError } = await supabase.auth.signInWithPassword({
      email: email,
      password: password
    });
    if (authError) {
      console.error('Authentication Error:', authError);
      return res.status(400).json({ message: authError.message });
    }

    return res.status(200).json({data: data, session: session})
  } catch (error) {
    console.error('Error during login:', error);
    return res.status(500).json({ message: 'An error occurred' });
  }
});

app.post('/taishan', async (req, res) => {
  const { name, url, research_interests } = req.body;
  const { data, error } = await supabase
    .from('Taishan')
    .insert([{ name, url, research_interests }]);

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  return res.status(201).json({ data });
});

app.get('/taishan', async (req, res) => {
  const { data, error } = await supabase
    .from('Taishan')
    .select('*');

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  return res.status(200).json({ data });
});

app.get('/kanban/get-all-or-create/:id', async (req, res) => {
    const userId = req.params.id;  
    try {
        let { data: board, error: authError } = await supabase
            .from('Applications')
            .select('*')
            .eq('user_id', userId)
            .single(); 
        

        if (!board) {
            const { data: newBoard, error: insertError } = await supabase
                .from('Applications')
                .insert([{
                    user_id: userId,
                    in_complete: [],
                    in_progress: [],  
                    completed: [],
                    follow_up: []
                }])
                .single();  

            

            if (insertError) {
                return res.status(400).json({ message: insertError.message });
            }

            board = newBoard;  
        }

      

        return res.status(200).json({ data: board });
        

    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
});



app.delete('/kanban/delete-in-progress/:id/:professorId', async (req, res) => {
  const userId = req.params.id;
  const professorId = parseInt(req.params.professorId);

  try {
      const { data: currentApp, error: fetchError } = await supabase
          .from('Applications')
          .select('in_progress')
          .eq('user_id', userId)
          .single();

      if (fetchError) {
          return res.status(400).json({ message: fetchError.message });
      }
      const currentInProgress = currentApp.in_progress || [];
      const updatedInProgress = currentInProgress.filter(prof => prof.id !== professorId);
      if (updatedInProgress.length === currentInProgress.length) {
          return res.status(404).json({ message: 'Professor not found in In Progress' });
      }
      const { data, error: updateError } = await supabase
          .from('Applications')
          .update({ in_progress: updatedInProgress })
          .eq('user_id', userId);

      if (updateError) {
          return res.status(500).json({ message: "Internal Error" });
      }

      return res.status(200).json({ data: data });

  } catch (error) {
      return res.status(500).json({ message: error.message });
  }
});

app.put('/kanban/update-in-progress-to-completed/:userId/:professorId', async (req, res) => {
  const userId = req.params.userId;
  const professorId = parseInt(req.params.professorId); 
  try {
      const { data: currentApp, error: authError } = await supabase
          .from('Applications')
          .select('in_progress, completed')
          .eq('user_id', userId)
          .single();

      if (authError) {
        return res.status(400).json({ message: 'Authentication Error'})
      }
      if (!currentApp) {
        return res.status(404).json({ message: 'Application not found' });
      }



      const currentInProgress = currentApp.in_progress || [];
      const currentCompleted = currentApp.completed || [];

      const professorToMove = currentInProgress.find(prof => prof.id === professorId);
      if (!professorToMove) {
          return res.status(404).json({ message: 'Professor not found in In Progress' });
      }

      const updatedInProgress = currentInProgress.filter(prof => prof.id !== professorId);
      const updatedCompleted = [...currentCompleted, professorToMove];
      const { data, error: updateError } = await supabase
          .from('Applications')
          .update({
              in_progress: updatedInProgress,
              completed: updatedCompleted
          })
          .eq('user_id', userId);

      if (updateError) {
        res.status(500).json({
          message: "Internal Server Error"
        })
      }
      return res.status(200).json({ 
          message: 'Professor moved to completed'});

  } catch (error) {
      return res.status(500).json({ message: 'Internal server error',error: error.message });
  }
});

app.post('/kanban/add-in-progress/:id', async (req, res) => {
  const userId = req.params.id;
  const { professor_data } = req.body;

  if (!professor_data) {
      return res.status(400).json({ message: 'Professor data is required.' });
  }

  

  try {
      const { data: currentData, error: fetchError } = await supabase
          .from('Applications')
          .select('in_progress')
          .eq('user_id', userId)
          .single(); 

      if (fetchError) {
          return res.status(400).json({ message: fetchError.message });
      }

      
      const currentInProgress = currentData.in_progress || [];

      const isDuplicate = currentInProgress.some(
        (prof) => prof.id === professor_data.id
      );

      if (isDuplicate) {
          return res.status(409).json({ 
              message: 'This professor is already in there.' 
          });
      }

      const professorWithTimestamp = {
        ...professor_data,
        added_at: new Date().toISOString() 
      };

      const updatedInProgress = [...currentInProgress, professorWithTimestamp];
      const { data, error: updateError } = await supabase
          .from('Applications')
          .update({ in_progress: updatedInProgress })
          .eq('user_id', userId);

      if (updateError) {
          return res.status(400).json({ message: updateError.message });
      }

      return res.status(200).json({ data: currentData });

  } catch (error) {
      return res.status(500).json({ message: error.message });
  }
});

//Run as a cron job
app.post('/kanban/maintenance/:id', async (req, res) => {
  const userId = req.params.id;
  const { force } = req.query; 

  try {
    const { data: application, error: fetchError } = await supabase
      .from('Applications')
      .select('completed')
      .eq('user_id', userId)
      .single();

    if (fetchError) {
      return res.status(400).json({ message: fetchError.message });
    }

    const currentInProgress = application.in_progress || [];
    const currentFollowUp = application.follow_up || [];
    const lastMaintenance = application.last_maintenance || new Date(0).toISOString();
    const shouldRun = force || 
      (new Date() - new Date(lastMaintenance)) > (24 * 60 * 60 * 1000);

    if (!shouldRun) {
      return res.status(200).json({ 
        message: 'Maintenance not needed',
        data: application
      });
    }
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const [updatedInProgress, movedToFollowUp] = currentInProgress.reduce(
      ([inProgress, followUp], prof) => {
        const addedDate = new Date(prof.added_at);
        if (addedDate < oneWeekAgo) {
          followUp.push(prof);
        } else {
          inProgress.push(prof);
        }
        return [inProgress, followUp];
      },
      [[], [...currentFollowUp]]
    );

    const { data, error: updateError } = await supabase
      .from('Applications')
      .update({ 
        in_progress: updatedInProgress,
        follow_up: movedToFollowUp,
        last_maintenance: new Date().toISOString() 
      })
      .eq('user_id', userId);

    if (updateError) {
      return res.status(400).json({ message: updateError.message });
    }

    return res.status(200).json({ 
      message: 'Maintenance completed',
      data: {
        in_progress: updatedInProgress,
        follow_up: movedToFollowUp,
        moved_count: movedToFollowUp.length - currentFollowUp.length
      }
    });

  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});



app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
