const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticateToken, authorizeRoles } = require('../middleware/authMiddleware');

//MySQL code only ---
// POST /api/hriReturns
router.post("/", authenticateToken, authorizeRoles ('bookmaker'), async (req, res) => {
  try {
    const { fixtureId,  ...values } = req.body;
    const permitNo = req.user.permitNo;
   
    console.log("Incoming body:", req.body);
   
    // insert return row
    await db.query(
      `INSERT INTO bookmaker_return
      (fixture_id,permit_no,euro_total_stake_away,euro_track_laid_off_away,euro_total_void_away,euro_total_stake_home,euro_track_laid_off_home,euro_total_void_home,stg_total_stake_away,stg_track_laid_off_away,stg_total_void_away,stg_total_stake_home,stg_track_laid_off_home,stg_total_void_home,exchange_laid,exchange_backed, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, Now(), Now())`,
      [
        fixtureId, 
        permitNo,
        values.euroTotalStakeAway,
        values.euroTrackLaidOffAway,
        values.euroTotalVoidAway,
        values.euroTotalStakeHome,
        values.euroTrackLaidOffHome,
        values.euroTotalVoidHome,
        values.stgTotalStakeAway,
        values.stgTrackLaidOffAway,
        values.stgTotalVoidAway,
        values.stgTotalStakeHome,
        values.stgTrackLaidOffHome,
        values.stgTotalVoidHome,
        values.exchangeLaid,
        values.exchangeBacked 
    ]
    );



    res.json({ message: "Return submitted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error submitting return" });
  }
});

module.exports = router;

