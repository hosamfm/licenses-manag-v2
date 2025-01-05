const isAuthenticated = (req, res, next) => {
  if (req.session && req.session.userId) {
    console.log(`User ${req.session.userId} is authenticated.`);
    return next(); // User is authenticated, proceed to the next middleware/route handler
  } else {
    console.log('User is not authenticated. Redirecting to login.');
    return res.redirect(302, '/auth/login'); // User is not authenticated, redirect to login
  }
};

const checkRole = (roles) => (req, res, next) => {
  if (req.session.userRole === 'no_permissions') {
    console.log(`User ${req.session.userId} has no permissions. Redirecting to no permissions page.`);
    return res.redirect('/licenses/no_permissions'); // Use the correct redirect path
  } else if (req.session.userRole && roles.includes(req.session.userRole)) {
    console.log(`User ${req.session.userId} has the required role: ${req.session.userRole}.`);
    return next(); // User has the required role, proceed to the next middleware/route handler
  } else {
    console.log(`User ${req.session.userId} does not have the required role. Insufficient permissions.`);
    return res.status(403).send('Insufficient permissions'); // User does not have the required role
  }
};

module.exports = {
  isAuthenticated,
  checkRole,
};
