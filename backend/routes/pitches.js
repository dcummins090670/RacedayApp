const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticateToken, authorizeRoles } = require('../middleware/authMiddleware');



// Get all racecourses so that we can use racecourse.name rather than id to add a new fixture
router.get('/racecourses',authenticateToken,authorizeRoles('admin'),async (req, res) => { 
           
        try {
            const [result] = await db.query(`

                SELECT racecourse_id,
                name 
                FROM racecourse 
                ORDER BY name ASC`
            );

        //const results = result.rows;    
        res.json(result);
        } catch (err) {
                console.error(err);
                res.status(500).json({ error: err.message });
        }
    }
    );

// Get pitches for a particular racecourse
router.get('/:racecourseId', authenticateToken, authorizeRoles('admin'), async (req, res) => {
    const { racecourseId } = req.params;
    try {
            const [result] = await db.query(`

            SELECT p.pitch_id,
            u.name, 
            CAST(p.seniority_date AS DATE) AS seniority,
            p.pitch_label,
            p.pitch_no
            FROM pitch p
            JOIN users u ON p.owner_permit_no = u.permit_no
            WHERE racecourse_id = ?
            ORDER BY p.pitch_label ASC`,
           [racecourseId]
           
            );
          
        //const results = result.rows;
        res.json(result);
        } catch (err) {
                console.error(err);
                res.status(500).json({ error: err.message });
        }
});

// Update transfer of pitch
     router.put('/:pitchId/transfer', authenticateToken, authorizeRoles('admin'), async (req, res) => {
        const { pitchId } = req.params;
        const { newOwnerPermitNo, transferValue } = req.body;

         if (!newOwnerPermitNo) {
            return res.status(400).json({ error: "newOwnerPermitNo is required" });
        }

            try {

                // Get current owner first
                const [current] = await db.query(
                "SELECT owner_permit_no FROM pitch WHERE pitch_id = ?",
                [pitchId]
                );
                //const current = currentResult.rows;
                if (current.length === 0) {
                return res.status(404).json({ error: "Pitch not found" });
                }
                const oldOwnerPermitNo = current[0].owner_permit_no;

                // Update pitch owner
                await db.query(`
                    UPDATE pitch 
                    SET owner_permit_no = ?
                    WHERE pitch_id = ?`, 
                    [newOwnerPermitNo, pitchId ]);

                // Log transfer
                await db.query(`
                    INSERT INTO pitch_transfer 
                    (pitch_id, old_owner_permit_no, new_owner_permit_no, transfer_value, transfer_date) VALUES (?, ?, ?, ?, now())`,
                    [pitchId, oldOwnerPermitNo, newOwnerPermitNo, transferValue ?? null]
                    );

                res.json({ message: 'Pitch transferred successfully' });
            } catch (err) {
                console.error(err);
                res.status(500).json({ error: err.message });
            }
        });



       /* 
    // SIS-only route
    router.post('/:permitNo/attendance', authenticateToken, authorizeRoles('sis'), (req, res) => {
        res.json({ message: `Attendance confirmed for pitch ${req.params.permitNo}` });
    });
    */

module.exports = router;


