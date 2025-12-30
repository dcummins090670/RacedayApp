const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticateToken, authorizeRoles } = require('../middleware/authMiddleware');

// MyQQL: Get fixtures + pitches for the logged-in bookmaker
router.get('/my-pitches', authenticateToken, authorizeRoles('bookmaker'), async (req, res) => {    
    const permitNo = req.user.permitNo; // from JWT

    try {
        const [result] = await db.query (
            `SELECT 	
                f.fixture_id,
                p.pitch_id,	
                CAST(f.fixture_date AS DATE) AS fixture_date,
                r.name AS racecourse_name,	
	            p.pitch_label,	
                p.pitch_no,	
                COALESCE(fps.status, 'Not Working') AS status	
            FROM users u	
            JOIN pitch p 	
                ON u.permit_no = p.owner_permit_no	
            JOIN racecourse r 	
                ON p.racecourse_id = r.racecourse_id	
            JOIN fixture f	
                ON r.racecourse_id = f.racecourse_id 
            LEFT JOIN fixture_pitch fps	
                ON fps.fixture_id = f.fixture_id	
                AND fps.pitch_id = p.pitch_id	
                AND fps.permit_no = u.permit_no 
            WHERE u.permit_no = ? 
            AND f.fixture_date >= CURRENT_DATE
            ORDER BY f.fixture_date`,	
            [permitNo]	
        );	
                // Left Join with FixturePitch ensures we always see a row, even if no status has been set yet.

        //const results = result.rows;
        res.json(result);

    } catch (err) {
        console.error(err);
        res.status(500).json({error:err.message});

    }    

});


// mySQL: Update pitch status for a fixture - when bookmker select a meeting to indicate status - "Working/Not Working)"
router.put('/my-pitches/:fixtureId/:pitchId/status',authenticateToken,authorizeRoles('bookmaker' ), async (req, res) => {
        const { fixtureId, pitchId } = req.params;
        const { status } = req.body;
        const permitNo = req.user.permitNo; // from JWT

        const validStatuses = ['Not Working', 'Applied'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: 'Invalid status for bookmaker' });
        }

        console.log("Status update:", { fixtureId, pitchId, permitNo, status });

        try {
            // Get fixture date for time checks
            const [fixtureRows] = await db.query(
                `SELECT f.fixture_date
                 FROM fixture f
                 JOIN pitch p ON p.racecourse_id = f.racecourse_id
                 WHERE f.fixture_id = ? AND p.pitch_id = ? AND p.owner_permit_no = ?`,
                [fixtureId, pitchId, permitNo]
            );
           // const fixtureRows = fixtureResult.rows;

            if (fixtureRows.length === 0) {
                return res.status(404).json({ error: 'Fixture or pitch not found for this bookmaker' });
            }

            const fixtureDate = new Date(fixtureRows[0].fixture_date);
            const now = new Date();

            // Time rules
            if (status === 'Applied') {
                // Must be at least 1 days before fixture
                const minApplyDate = new Date(fixtureDate);
                minApplyDate.setDate(minApplyDate.getDate() -5);
                if (now > minApplyDate) {
                    return res.status(400).json({
                        error: 'You must apply at least 5 days before the fixture date'
                    });
                }
            }

            if (status === 'Not Working') {
                // Must be before 9am on fixture date
                const deadline = new Date(fixtureDate);
                deadline.setHours(18, 0, 0, 0);
                if (now > deadline) {
                    return res.status(400).json({
                        error: 'You can only change to Not Working before 9am on fixture day'
                    });
                }
            }

            // Ensure FixturePitchStatus record exists
            const [existing] = await db.query(
                `SELECT * FROM fixture_pitch WHERE fixture_id = ? AND pitch_id = ?`,
                [fixtureId, pitchId]
            );

            //const existing = existingPitch.rows;
            if (existing.length === 0) {
                // Create it if not found
                await db.query(
                    `INSERT INTO fixture_pitch (fixture_id, pitch_id, permit_no, status, updated_at)
                     VALUES (?, ?, ?, ?, now())`,
                    [fixtureId, pitchId, permitNo, status]
                );
            } else {
                // Update existing
                await db.query(
                    `UPDATE fixture_pitch
                     SET status = ?, updated_at = now()
                     WHERE fixture_id = ? AND pitch_id = ?`,
                    [status, fixtureId, pitchId]
                );
            }

            res.json({
                message: `Status updated`
            });

        } catch (err) {
            console.error(err);
            res.status(500).json({ error: err.message });
        }
    }
);


router.get('/upcoming', async (req, res) => {
       // const fixtureId = req.params.fixtureId;

        try {
            const [result] = await db.query(`
           
                SELECT f.fixture_id, 
                        CAST(f.fixture_date AS DATE) AS fixture_date,
                        r.racecourse_id,
                        r.name,
                        f.premium_area_available, f.number_of_premium_pitches,
                        f.corporate_area_available, f.number_of_corporate_pitches
                FROM fixture f
                JOIN racecourse r ON f.racecourse_id = r.racecourse_id
                WHERE f.fixture_date >= CURRENT_DATE 
                ORDER BY f.fixture_date ASC`
            );

            //const results = result.rows;
            res.json(result);
            } catch (err) {
                console.error(err);
                res.status(500).json({ error: err.message });
            }
    }
);

// Get attended pitches for a specific fixture
router.get('/:fixtureId/pitches', async (req, res) => {
  const { fixtureId } = req.params;

  try {
    const [result] = await db.query(
      `SELECT 
            p.pitch_id, 
            p.pitch_label, 
            p.pitch_no, 
            u.name AS bookmaker_name,
            u.permit_no,
            r.name AS racecourse,
            r.racecourse_id,
            COALESCE(fp.status, 'Not Working') AS status,
            COALESCE(fp.attendance, 'Did Not Attend') AS attendance
       FROM pitch p
       JOIN users u ON u.permit_no = p.owner_permit_no
       JOIN fixture f ON f.racecourse_id = p.racecourse_id
       JOIN racecourse r ON r.racecourse_id = f.racecourse_id
       LEFT JOIN fixture_pitch fp
              ON fp.pitch_id = p.pitch_id AND fp.fixture_id = f.fixture_id
       WHERE f.fixture_id = ? AND u.name !='Vacant'
       ORDER BY p.pitch_id`,
      [fixtureId]
    );
    //const results = result.rows;
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch pitches' });
  }
});

// Code for SIS or Admin to confirm attendance
// Update pitch attendance for a fixture (SIS/Admin only)
router.put('/:fixtureId/:pitchId/attendance',authenticateToken,authorizeRoles('sis', 'admin'),async (req, res) => {
        const { fixtureId, pitchId } = req.params;
        const { attendance } = req.body; 
           

        // Simple validation
        const validOption = ['Did Not Attend', 'Attended'];
        if (!validOption.includes(attendance)) {
            return res.status(400).json({ error: 'Invalid attendance option' });
        }
     
        // Insert new row if not exists, else update
            await db.query(
                `INSERT INTO fixture_pitch (fixture_id, pitch_id, attendance)
                VALUES (?, ?, ?)
                ON DUPLICATE KEY UPDATE attendance = VALUES(attendance)`,
                [fixtureId, pitchId, attendance]
            );     
    
        // PostgreSQL - Insert new row if not exists, else update
         /*   await db.query(
                `INSERT INTO fixture_pitch (fixture_id, pitch_id, attendance)
                VALUES ($1, $2, $3)
                ON CONFLICT (fixture_id, pitch_id)
                DO UPDATE SET attendance = EXCLUDED.attendance`, 
                [fixtureId, pitchId, attendance]
            );
         */   
        res.json({ message: `Attendance updated`});
    
    }
);

router.post("/:fixtureId/attendance-list", async (req, res) => {
        const { fixtureId } = req.params;
        const { attendees } = req.body;

        if (!Array.isArray(attendees) || attendees.length === 0) {
            return res.status(400).json({ error: "No attendees provided" });
        }

        try {
            await db.query("BEGIN");
            // First delete existing attendees for this fixture
            await db.query(`DELETE FROM pitch_attendance WHERE fixture_id = ?`, [fixtureId]);
            // Insert all attendees
            for (const a of attendees) {
             await db.query(
                `INSERT INTO pitch_attendance (fixture_id, pitch_id, bookmaker_permit_no, attended_at)
                VALUES (?, ?, ?, NOW())`,
                [fixtureId, a.pitchId, a.bookmakerPermitNo]
             );
            }
            await db.query("COMMIT");
            res.json({ message: "Attendees stored successfully" });

        } catch (err) {
            await db.query("ROLLBACK");
            console.error("Transaction failed:", err.message);
            res.status(500).json({ error: err.message });
            }
        });   

//ATTENDANCE LIST for LAST 3 MONTHS
router.get('/previousMonth', async (req, res) => {
       // const fixtureId = req.params.fixtureId;

        try {
            const [result] = await db.query(`
           
                SELECT f.fixture_id, 
                CAST(f.fixture_date AS DATE) AS fixture_date,
                r.name
                FROM fixture f
                JOIN racecourse r ON f.racecourse_id = r.racecourse_id
                WHERE f.fixture_date BETWEEN CURRENT_DATE() -300 AND CURRENT_DATE
                ORDER BY f.fixture_date DESC`
            );
            //const results = result.rows;
            res.json(result);
            } catch (err) {
                console.error(err);
                res.status(500).json({ error: err.message });
            }
    }
);

// AttendeePage - Get attended pitches for a specific fixture
router.get('/:fixtureId/attended-pitches', async (req, res) => {
  const { fixtureId } = req.params;

  try {
    const [result] = await db.query(
      `SELECT 
            p.pitch_id, 
            p.pitch_label, 
            p.pitch_no, 
            u.name AS bookmaker_name,
            u.permit_no,
            r.name AS racecourse,
            r.racecourse_id,
            CAST(f.fixture_date AS DATE) AS fixture_date,
            COALESCE(fp.status, 'Not Working') AS status,
            COALESCE(fp.attendance, 'Did Not Attend') AS attendance
       FROM pitch p
       JOIN users u ON u.permit_no = p.owner_permit_no
       JOIN fixture f ON f.racecourse_id = p.racecourse_id
       JOIN racecourse r ON r.racecourse_id = f.racecourse_id
       LEFT JOIN fixture_pitch fp
              ON fp.pitch_id = p.pitch_id AND fp.fixture_id = f.fixture_id
       WHERE f.fixture_id = ? AND u.name !='Vacant' AND attendance = 'Attended'
       ORDER BY p.pitch_id`,
      [fixtureId]
    );

    //const results = result.rows;
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch pitches' });
  }
});

// Get all fixtures with racecourse name
    router.get('/', async (req, res) => {
        //const fixtureId = req.params.fixtureId;

        try {
            const [result] = await db.query(
            `SELECT f.fixture_id, 
                    CAST(f.fixture_date AS DATE) AS fixture_date,
                    r.racecourse_id,
                    r.name,
                    f.premium_area_available
            FROM fixture f
            JOIN racecourse r ON f.racecourse_id = r.racecourse_id
            WHERE f.fixture_date > CURRENT_DATE 
            ORDER BY f.fixture_date ASC`
            );

        //const results = result.rows;
        res.json(result);
        } catch (err) {
            console.error("Error fetching fixtures:", err);
            res.status(500).json({ error: err.message });
        }
    });

// Get all racecourses so that we can use racecourse.name rather than id to add a new fixture
    router.get('/racecourses',async (req, res) => { 
           
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
    });

    // Delete fixture
     router.delete('/:fixtureId', authenticateToken, authorizeRoles('admin'), async (req, res) => {
        const { fixtureId } = req.params;
            try {
                await db.query(`DELETE FROM fixture WHERE fixture_id = ?`, [fixtureId]);
                res.json({ message: 'Fixture deleted successfully' });
            } catch (err) {
                console.error(err);
                res.status(500).json({ error: err.message });
            }
        });

    // Add new fixture
    router.post('/', authenticateToken, authorizeRoles('admin'), async (req, res) => {
        const { fixtureDate, racecourseId } = req.body;
         try {
            await db.query(
             `INSERT INTO fixture (fixture_date, racecourse_id) VALUES (?, ?)`,
             [fixtureDate, racecourseId]
             );
             res.json({ message: 'Fixture added successfully' });
         } catch (err) {
                console.error(err);
                res.status(500).json({ error: err.message });
        }
    });
    


router.get("/:racecourseId/attendance-list", async (req, res) => {
        const { racecourseId } = req.params;  
        try {
            // Get all attendees for a particular fixture (Note pa.id is used for the unique key in attendees)
            const [result] = await db.query(
                `SELECT
                    pa.id,
                    CAST(f.fixture_date AS DATE) AS fixture_date,
                    r.racecourse_id,
                    r.name AS racecourse,
                    p.pitch_label AS location,
                    p.pitch_no,
                    u.name
                    FROM pitch p
                    JOIN users u ON u.permit_no = p.owner_permit_no
                    JOIN fixture f ON f.racecourse_id = p.racecourse_id
                    JOIN racecourse r ON r.racecourse_id = f.racecourse_id
                    JOIN pitch_attendance pa
                            ON pa.pitch_id = p.pitch_id AND pa.fixture_id = f.fixture_id            
                    WHERE r.racecourse_id = ?
                    ORDER BY f.fixture_date ASC`,
                    [racecourseId]
             );
                    
            // const results = result.rows;
            res.json(result);
            } catch (err) {
            console.error(err);
            res.status(500).json({ error: "Database error" });
            }
});



module.exports = router;

