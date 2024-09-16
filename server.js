const express = require('express');
const path = require('path');
const cors = require('cors'); // Enable Cross-Origin Resource Sharing
const passport = require('passport');
const session = require('express-session');
const GithubStrategy = require('passport-github2').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const axios = require('axios');
const { Octokit } = require('@octokit/rest');
const app = express();
const port = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Configure Github Credentials
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;

// Configure Google Credentials
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const CHANNEL_ID = process.env.CHANNEL_ID;

// set up passport.js
passport.use(new GoogleStrategy({
    clientID: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.CALLBACK_URL_GOOGLE,
    scope: ['https://www.googleapis.com/auth/youtube.readonly']
}, (accessToken, refreshToken, profile, done) => {
    profile.accessToken = accessToken;
    return done(null, profile);
}));


passport.use(new GithubStrategy({
    clientID: GITHUB_CLIENT_ID,
    clientSecret: GITHUB_CLIENT_SECRET,
    callbackURL: process.env.CALLBACK_URL_GITHUB,
    },
    (accessToken, refreshToken, profile, done) => {
        profile.accessToken = accessToken;
        return done(null, profile);
    }
));

passport.serializeUser((user, done) => {
    done(null, user);
});

passport.deserializeUser((user, done) => {
    done(null, user);
});

app.use(session({
    secret: 'keyboard cat',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } 
}));

app.use(passport.initialize());
app.use(passport.session());

app.use(express.static(path.join(__dirname, 'public')));

// Serve HTML files directly
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/login_screen.html'));
});
// Routes for Google Login

app.get('/auth/google', passport.authenticate('google', { scope: ['openid', 'profile', 'email', 'https://www.googleapis.com/auth/youtube.readonly'] }));

app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/' }), async(req, res) => 
    {
        const { accessToken } = req.user;
        req.session.googleaccessToken = accessToken;
        try {
            const response = await axios.get(`https://www.googleapis.com/youtube/v3/subscriptions?part=snippet&forChannelId=${CHANNEL_ID}&mine=true`, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            const isSubscribed = response.data.items.length > 0;

            req.session.isSubscribed = isSubscribed;

            if(isSubscribed) {
                res.redirect('/login/success');
            }else {
                res.redirect('/youtube/verification/failed');
            }
        }
        catch(error) {
                res.send('Error checking subscription');
            }
        }
);

// Github Routes

app.get('/auth/github', passport.authenticate('github', { scope: ['user:email'] }));

app.get('/auth/github/callback', 
    passport.authenticate('github', { failureRedirect: '/' }),
    async (req, res) => {
        const { accessToken } = req.user;
        const octokit = new Octokit({
            auth: accessToken
        });

        try {
            const response = await octokit.request('GET /user/following/bytemait', {
                headers: {
                    'X-GitHub-Api-Version': '2022-11-28'
                }
            });
            if (response.status === 204) {
                res.redirect('/login/success');
            } else {
                res.redirect('/github/verification/failed');
            }
        } catch (error) {
            console.error('Error:', error);

            res.redirect('/github/verification/failed');
        }
    }
);


async function ensureSubscribed(req, res, next) {
    if (req.isAuthenticated() && req.session.googleaccessToken) {
        const accessToken = req.session.googleaccessToken;
        try {
            const response = await axios.get(`https://www.googleapis.com/youtube/v3/subscriptions?part=snippet&forChannelId=${CHANNEL_ID}&mine=true`, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            const isSubscribed = response.data.items.length > 0;

            req.session.isSubscribed = isSubscribed;

            if(isSubscribed) {
                return next(); 
            }else {
                res.redirect('/youtube/verification/failed');
            }
        } catch (error) {
            console.error('Error:', error);
            res.redirect('/youtube/verification/failed');
        }
    }   else {
        return res.redirect('/');
    }
}

app.get('/youtube/verification/failed', (req, res) => {
    if(req.isAuthenticated()) {
        res.sendFile(path.join(__dirname, 'public/youtube_verification_failed.html'));
    }else {
        res.redirect('/');
    }
});

app.get('/github/verification/failed', (req, res) => {
    if(req.isAuthenticated()) {
        res.sendFile(path.join(__dirname, 'public/github_verification_fail.html'));
    }else {
        res.redirect('/');
    }
});

app.get('/login/success', ensureSubscribed, (req, res) => {
    res.sendFile(path.join(__dirname, 'public/success.html'));
});

app.get('*', (req, res) => {
    res.redirect('/'); // Redirect to the homepage
});

// Start server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});


