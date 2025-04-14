import express from 'express'
import { supabase } from '../supabase/supabase';

const router = express.Router()
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

//Get All
router.get('/database', async (req, res) => {
    const { data, error } = await supabase
        .from('Taishan')
        .select('*');
    
        if (error) {
            return res.status(400).json({message: error})
        } else {
            return res.status(201).json({ data })
        }
})

//Get all Through Filter



