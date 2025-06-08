const createError = require('http-errors');
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const flash = require('express-flash');

const indexRouter = require('./routes/index');
const usersRouter = require('./routes/users');
const booksRouter = require('./routes/books');
const session = require('express-session');

const app = express(); // Inicializar la aplicación Express


// Configuración del motor de vistas
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Middlewares
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Configuración de sesión y mensajes flash
app.use(session({
    secret: 'secret', // En producción usa variable de entorno para mayor seguridad
    resave: false,    // Mejor poner false para evitar guardar sesión si no cambió
    saveUninitialized: false, // Mejor false para no crear sesión hasta que haya datos
    cookie: { maxAge: 60000 },
    store: new session.MemoryStore() // En producción usar store externo (ej Redis)
}));
app.use(flash());

//vistas
app.use((req, res, next) => {
  res.locals.currentPath = req.path;
  next();
});
// Rutas
app.get('/', (req, res) => {
  res.render('inicie');
});
app.use('/users', usersRouter);
app.use('/books', booksRouter);
app.use('/', indexRouter);
app.get('/nosotros', (req, res) => {
  res.render('nosotros');
});



//////////////////////////


// Captura errores 404
app.use(function(req, res, next) {
  next(createError(404));
});

// Manejador de errores
app.use(function(err, req, res, next) {
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
