// ../database/database.js
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = './data/suggestions.db';

if (!fs.existsSync('./data')) {
    fs.mkdirSync('./data', { recursive: true });
}

const db = new sqlite3.Database(path, (err) => {
    if (err) {
        console.error('Database connection error:', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        setupDatabase();
    }
});

function setupDatabase() {
    db.run(`
        CREATE TABLE IF NOT EXISTS suggestions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userId TEXT NOT NULL,
            content TEXT NOT NULL,
            upvotes INTEGER DEFAULT 0,
            downvotes INTEGER DEFAULT 0,
            status TEXT DEFAULT 'pending',
            staffComment TEXT DEFAULT NULL,
            imageUrl TEXT DEFAULT NULL,
            messageId TEXT DEFAULT NULL,
            hexID TEXT NOT NULL DEFAULT ''
        )
    `, (err) => {
        if (err) {
            console.error('Error creating suggestions table:', err.message);
        } else {
            console.log('Suggestions table is ready.');
        }
    });

    db.run(`
        CREATE TABLE IF NOT EXISTS votes (
            suggestionId INTEGER NOT NULL,
            userId TEXT NOT NULL,
            voteType TEXT NOT NULL CHECK (voteType IN ('upvote', 'downvote')),
            PRIMARY KEY (suggestionId, userId),
            FOREIGN KEY (suggestionId) REFERENCES suggestions(id) ON DELETE CASCADE
        )
    `, (err) => {
        if (err) {
            console.error('Error creating votes table:', err.message);
        } else {
            console.log('Votes table is ready.');
        }
    });
}


module.exports = db;
