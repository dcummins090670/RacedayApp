const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticateToken, authorizeRoles } = require('../middleware/authMiddleware');

// Update premiumArea for a fixture (Admin only)
    router.put('/:fixtureId/premiumArea',authenticateToken,authorizeRoles('admin'),async (req, res) => {
        const { fixtureId } = req.params;
        const { premiumAreaAvailable, numberOfPremiumPitches } = req.body;
        
        //const { numberOfPremiumPitches } = req.body;
    

        try {
            // Get fixture date
            const [fixture] = await db.query(
                `SELECT *
                    FROM fixture f
                    JOIN racecourse r ON r.racecourse_id = f.racecourse_id
                    WHERE f.fixture_id = ?`,
                [fixtureId]
            );
            //const fixtureRows = fixture.rows;
            if (fixture.length === 0) {
            return res.status(404).json({ error: 'Fixture not found' });
            }

             // Build dynamic SQL based on what fields are provided
                const updates = [];
                const params = [];

                if (premiumAreaAvailable !== undefined) {
                    updates.push('premium_area_available = ?');
                    params.push(premiumAreaAvailable);

                }

                if (numberOfPremiumPitches !== undefined) {
                    updates.push('number_of_premium_pitches = ?');
                    params.push(numberOfPremiumPitches);

                }

                if (updates.length === 0) {
                    return res.status(400).json({ error: 'No fields to update' });
                }

                params.push(fixtureId); // Add fixtureId for WHERE clause

                

                // Insert new row if not exists, else update
                await db.query(
                `UPDATE fixture SET ${updates.join(', ')} WHERE fixture_id = ?`,
                params
            );

           res.json({ 
            message: `Fixture ${fixtureId} updated successfully`,
            updated: { premiumAreaAvailable, numberOfPremiumPitches }
        });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: err});
        }
    }
);  

// Get all premium fixtures with racecourse name
    router.get('/', async (req, res) => {
        //const fixtureId = req.params.fixtureId;
   
         try {
             const [result] = await db.query(
             `SELECT f.fixture_id, 
             CAST(f.fixture_date AS DATE) AS fixture_date,
             r.racecourse_id,
             r.name 
             FROM fixture f
             JOIN racecourse r ON f.racecourse_id = r.racecourse_id
             WHERE f.fixture_date >= CURRENT_DATE AND f.premium_area_available = TRUE
             ORDER BY f.fixture_date ASC`
             );
         //const results = result.rows;    
         res.json(result);
            } catch (err) {
             console.error("Error fetching fixtures:", err);
              res.status(500).json({ error: err.message });
          }
    });





// Get fixtures + pitches for the logged-in bookmaker
    router.get('/my-premium-pitches', authenticateToken, authorizeRoles('bookmaker'), async (req, res) => {    
        const permitNo = req.user.permitNo; // from JWT

        try {
            const [result]
            = await db.query (
                `SELECT 
                    f.fixture_id,
                    f.premium_area_available,
                    CAST(f.fixture_date AS DATE) AS fixture_date,
                    r.racecourse_id,
                    r.name AS racecourse_name,
                    p.pitch_id,
                    p.pitch_label,
                    p.pitch_no,
                COALESCE(pfp.premium_status, 'Not Applying') AS premium_status   
                FROM users u
                JOIN pitch p 
                    ON u.permit_no = p.owner_permit_no
                JOIN racecourse r 
                    ON p.racecourse_id = r.racecourse_id
                JOIN fixture f
                    ON r.racecourse_id = f.racecourse_id                
                LEFT JOIN premium_fixture_pitch pfp
                    ON pfp.fixture_id = f.fixture_id
                    AND pfp.pitch_id = p.pitch_id
                    AND pfp.permit_no = u.permit_no    
                WHERE u.permit_no = ?  AND f.premium_area_available = TRUE AND f.fixture_date >= CURRENT_DATE  
                ORDER BY f.fixture_date`,
                [permitNo]
            );
        // Left Join with FixturePitchStatus ensures we always see a row, even if no status has been set yet. WHERE u.permitNo = ?  AND f.fixtureDate >= CURDATE() AND f.premiumAreaAvailable = TRUE
            //const results = result.rows;
            res.json(result);

        } catch (err) {
            console.error("Error fetching premium pitches:", err);
            res.status(500).json({error:err.message});
        }    

    });


    // Update pitch status for a fixture (Bookmaker version with time rules) - Used when bookmker select a meeting to indicate status - "Applying/Not Applying)"
    router.put('/my-premium-pitches/:fixtureId/:pitchId/:racecourseId/premium-status',authenticateToken,authorizeRoles('bookmaker'),async (req, res) => {
            const { fixtureId, pitchId, racecourseId } = req.params;
            const { premiumStatus } = req.body;
            const permitNo = req.user.permitNo; // from JWT

            const validStatuses = ['Not Applying', 'Applied'];
            if (!validStatuses.includes(premiumStatus)) {
                return res.status(400).json({ error: 'Invalid status for bookmaker' });
            }

            try {
                // Get fixture date for time checks
                const [fixture] = await db.query(
                    `SELECT f.fixture_date
                    FROM fixture f
                    JOIN pitch p ON p.racecourse_id = f.racecourse_id
                    WHERE f.fixture_id = ? AND p.pitch_id = ? AND p.racecourse_id = ? AND p.owner_permit_no = ?`,
                    [fixtureId, pitchId, racecourseId, permitNo]
                );
                //const fixtureRows = fixture.rows;
                if (fixture.length === 0) {
                    return res.status(404).json({ error: 'Fixture or pitch not found for this bookmaker' });
                }

                const fixtureDate = new Date(fixture[0].fixture_date);
                const now = new Date();

                // Time rules
                if (premiumStatus === 'Applied') {
                    // Must be at least 7 days before fixture
                    const minApplyDate = new Date(fixtureDate);
                    minApplyDate.setDate(minApplyDate.getDate() - 2);
                    if (now > minApplyDate) {
                        return res.status(400).json({
                            error: 'You must apply at least 2 days before the fixture date'
                        });
                    }
                }

                if (premiumStatus === 'Not Applying') {
                    // Must be before 9am on fixture date
                    const deadline = new Date(fixtureDate);
                    deadline.setHours(9, 0, 0, 0);
                    if (now > deadline) {
                        return res.status(400).json({
                            error: 'You can only change to Not Working before 9am on fixture day'
                        });
                    }
                }

                // Ensure FixturePitchStatus record exists
                const [result] = await db.query(
                    `SELECT * FROM premium_fixture_pitch WHERE fixture_id = ? AND pitch_id = ? AND racecourse_id = ?`,
                    [fixtureId, pitchId, racecourseId]
                );
                //const existing = result.rows;
                if (result.length === 0) {
                    // Create it if not found
                    await db.query(
                        `INSERT INTO premium_fixture_pitch (fixture_id, pitch_id, racecourse_id, permit_no, premium_status, updated_at)
                        VALUES (?, ?, ?, ?, ?, NOW())`,
                        [fixtureId, pitchId, racecourseId, permitNo, premiumStatus]
                    );
                } else {
                    // Update existing
                    await db.query(
                        `UPDATE premium_fixture_pitch
                        SET premium_status = ?, updated_at = NOW()
                        WHERE fixture_id = ? AND pitch_id = ? AND racecourse_id = ?`,
                        [premiumStatus, fixtureId, pitchId, racecourseId ]
                    );
                }

                res.json({
                    message: `Status updated to '${premiumStatus}' for your pitch ${pitchId} at racecourse ${racecourseId} in fixture ${fixtureId}`
                });

            } catch (err) {
                console.error(err);
                res.status(500).json({ error: err.message });
            }
        }
    );



// Get all pitches for the next 3 weeks fixture (Bookmaker/SIS/Admin)
    router.get('/upcoming' ,async (req, res) => {
        
        try {
            const [result] = await db.query(`
                
                SELECT  f.fixture_id, 
                        f.number_of_premium_pitches,
                        f.premium_area_available,
                        CAST(f.fixture_date AS DATE) AS fixture_date,
                        r.racecourse_id,
                        r.name
                FROM fixture f
                JOIN racecourse r ON f.racecourse_id = r.racecourse_id
                WHERE f.fixture_date >= CURRENT_DATE AND f.premium_area_available = TRUE
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

// Get pitches for a premium fixture (this is what setPitches returns in PremiumAttendancePage - pitches can then be mapped through with these props)
router.get('/:fixtureId/premium-pitches', async (req, res) => {
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
        f.number_of_premium_pitches,
        COALESCE(pfp.premium_status, 'Not Applying') AS premium_status,
        COALESCE(pfp.location, 'Main Ring') AS location,
        (SELECT MAX(pa.attended_at) FROM premium_attendance pa WHERE pa.pitch_id = p.pitch_id) AS last_day_used
       FROM pitch p
       JOIN users u ON u.permit_no = p.owner_permit_no
       JOIN fixture f ON f.racecourse_id = p.racecourse_id
       JOIN racecourse r ON r.racecourse_id = f.racecourse_id
       LEFT JOIN premium_fixture_pitch pfp
              ON pfp.pitch_id = p.pitch_id AND pfp.fixture_id = f.fixture_id
       WHERE f.fixture_id = ? AND u.name !='Vacant' AND pfp.premium_status = 'Applied'
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

// Update pitch location for a fixture (SIS/Admin only)
    router.put('/:fixtureId/:pitchId/:racecourseId/status',authenticateToken,authorizeRoles('admin'),async (req, res) => {
        const { fixtureId, pitchId, racecourseId } = req.params;
        const { location } = req.body;      
    
        // Simple validation
        const validOption = ['Main Ring', 'Premium Area'];
        if (!validOption.includes(location)) {
            return res.status(400).json({ error: 'Invalid location option' });
        }

        try {
            // Get fixture date
            const [fixture] = await db.query(
                `SELECT fixture_date FROM fixture WHERE fixture_id = ?`,
                [fixtureId]
            );
            //const fixtureRows = fixture.rows;
            if (fixture.length === 0) {
            return res.status(404).json({ error: 'Fixture not found' });
        }
        // For MySQL
            // Insert new row if not exists, else update
            await db.query(
                `INSERT INTO premium_fixture_pitch (fixture_id, pitch_id, racecourse_id, location)
                VALUES (?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE location = VALUES(location)`,
                [fixtureId, pitchId, racecourseId, location]

            );
          res.json({message: `Location updated to '${location}' for Pitch ${pitchId} at Racecourse ${racecourseId} in Fixture ${fixtureId}` });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: err});
        }
    }
);

    router.post("/:fixtureId/attendance-list", async (req, res) => {
            const { fixtureId } = req.params;
            const { attendees } = req.body;
            
            if (!Array.isArray(attendees) || attendees.length === 0) {
                    return res.status(400).json({ error: "No attendees provided" });
            }
            
            try {
                // First delete existing attendees for this fixture
                await db.query(
                    `DELETE FROM premium_attendance WHERE fixture_id = ?`,
                    [fixtureId]
                    );
                // Insert all attendees
                for (const a of attendees) {
                await db.query(
                    `INSERT INTO premium_attendance (fixture_id, pitch_id, bookmaker_permit_no, attended_at)
                    VALUES (?, ?, ?, NOW())`,
                    [fixtureId, a.pitchId, a.bookmakerPermitNo]
                );
                }
            
                res.json({ message: "Attendees stored successfully" });
            } catch (err) {
                    console.error(err);
                res.status(500).json({ error: "Database error" });
            }
        }); 
    
// Get all racecourses so that we can use racecourse.name rather than id to add a new fixture
    router.get('/racecourses', async (req, res) => { 
           
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
                    JOIN premium_attendance pa
                            ON pa.pitch_id = p.pitch_id AND pa.fixture_id = f.fixture_id            
                    WHERE r.racecourse_id = ?
                    ORDER BY f.fixture_date DESC`,
                    [racecourseId]
                );
                //const results = result.rows;        
                res.json(result);
            } catch (err) {
                 console.error(err);
                res.status(500).json({ error: "Database error" });
            }
    });

    // Get attended pitches for a specific fixture
    router.get('/:fixtureId/awarded-pitches', async (req, res) => {
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
                COALESCE(pfp.location, 'Main Ring') AS location,
                COALESCE(pfp.premium_status, 'Not Applying') AS premium_status
            FROM pitch p
            JOIN users u ON u.permit_no = p.owner_permit_no
            JOIN fixture f ON f.racecourse_id = p.racecourse_id
            JOIN racecourse r ON r.racecourse_id = f.racecourse_id
            LEFT JOIN premium_fixture_pitch pfp
                    ON pfp.pitch_id = p.pitch_id AND pfp.fixture_id = f.fixture_id
            WHERE f.fixture_id = ? AND u.name !='Vacant' AND pfp.location ='Premium Area'
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
    
    


module.exports = router;