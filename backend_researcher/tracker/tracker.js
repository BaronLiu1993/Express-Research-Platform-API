import express from 'express'
import { supabase } from '../supabase/supabase';

const router = express.Router()

router.get('/kanban/get-all-or-create/:id', async (req, res) => {
    const userId = req.params.id;  
    try {
        let { data: board, error: authError } = await supabase
            .from('Applications')
            .select('*')
            .eq('user_id', userId)
            .single(); 
        if (authError) {
            return res.status(400).json({ message: authError.message });
        } 

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



router.delete('/kanban/delete-in-progress/:id/professorId', async (req, res) => {
    const userId = req.params.id
    const professorId = req.params.professorId

    try {
        const {data, error: authError} = await supabase
            .from('Applications')
            .update({
                in_progress: supabase.raw('array_remove(in_progress, ?)', [{ id: professorId }])
            })
            .eq('user_id', userId)

            if (authError) {
                return res.status(400).json({message: authError.message})
            }

            return res.status(200).json({ data: data })
    } catch (error) {
        return res.status(500).json({ message: error.message})
    }
})


router.put('/kanban/update-in-progress-to-completed/:id/professorId', async (req, res) => {
    const userId = req.params.id
    const professorId = req.params.professorId

    try {
        const { data, error: authError } = await supabase
            .from('Applications')
            .update({
                in_progress: supabase.raw('array_remove(in_progress, ?)', [{ id: professorId }]),
                completed: supabase.raw('array_append(completed, ?)', [{ id: professorId }]) 
            })
            .eq('user_id', userId)
            
        if (authError) {
            return res.status(400).json({message: authError.message})
        } else {
            return res.status(200).json({data: data})
        }
    } catch (error) {
        if (error) {
            return res.status(500).json({message: error.message})
        }
    }
})

router.post('/kanban/add-in-progress/:id', async (req, res) => {
    const userId = req.params.id;
    const { professor_data } = req.body;  
    try {
        const { data, error: insertError } = await supabase
            .from('Applications')
            .update({
                in_progress: supabase.raw('array_append(in_progress, ?)', [professor_data])
            })
            .eq('user_id', userId);

        if (insertError) {
            return res.status(400).json({ message: insertError.message });
        }

        return res.status(200).json({ data: data });

    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
});

