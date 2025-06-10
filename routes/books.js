var express = require('express');
var router = express.Router();
var dbConn = require('../lib/db');
const bcrypt = require('bcrypt');

// --- RUTAS PARA LIBROS ---
// Mostrar la portada antes de loguear
router.get('/', (req, res) => {
    if (!req.session.user) {
        // Mostrar la portada antes de loguear
        return res.render('inicie');
    }

    if (req.session.user.role === 'admin') {
        const query = `
            SELECT 
                books.id, books.name, 
                authors.name AS author, 
                categories.name AS category, 
                editorials.name AS editorial,
                books.isbn, books.edition, books.year, books.copies
            FROM books
            LEFT JOIN authors ON books.author_id = authors.id
            LEFT JOIN categories ON books.category_id = categories.id
            LEFT JOIN editorials ON books.editorial_id = editorials.id
            ORDER BY books.id DESC
        `;

        dbConn.query(query, (err, libros) => {
            if (err) {
                req.flash('error', 'Error al obtener libros');
                return res.render('books/index', { data: [], autores: [], devueltos: 0, messages: req.flash() });
            }

            // Consulta para contar libros devueltos este mes
            const countQuery = `
                SELECT COUNT(*) AS devueltos
                FROM loans
                WHERE devuelto = 1
                  AND MONTH(fecha_devolucion) = MONTH(CURDATE())
                  AND YEAR(fecha_devolucion) = YEAR(CURDATE())
            `;
            dbConn.query(countQuery, (err3, result) => {
                const devueltos = (!err3 && result && result[0]) ? result[0].devueltos : 0;

                dbConn.query('SELECT * FROM authors', (err2, autores) => {
                    if (err2) autores = [];
                    res.render('books/index', { data: libros, autores, devueltos, messages: req.flash() });
                });
            });
        });
    } else {
        return res.redirect('/loans/my');
    }
});
// Mostrar formulario para agregar libro
router.get('/add', (req, res) => {
    dbConn.query('SELECT * FROM authors', (err1, authors) => {
        if (err1) authors = [];

        dbConn.query('SELECT * FROM categories', (err2, categories) => {
            if (err2) categories = [];

            dbConn.query('SELECT * FROM editorials', (err3, editorials) => {
                if (err3) editorials = [];

                res.render('books/add', {
                    name: '',
                    author_id: '',
                    category_id: '',
                    editorial_id: '',
                    authors,
                    categories,
                    editorials,
                    year: new Date().getFullYear(),
                    messages: req.flash()
                });
            });
        });
    });
});

// Procesar formulario para agregar libro
// Ejemplo para POST /books/add
router.post('/add', (req, res) => {
    const { name, author_id, category_id, editorial_id, isbn, edition, year, copies } = req.body;
    // ...validaciones...
    dbConn.query(
        'INSERT INTO books (name, author_id, category_id, editorial_id, isbn, edition, year, copies) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [name, author_id, category_id, editorial_id, isbn, edition, year, copies],
        (err) => {
            if (err) {
                req.flash('error', 'Error al agregar libro: ' + err.message);
                return res.redirect('/books/add');
            }
            req.flash('success', 'Libro agregado correctamente');
            res.redirect('/books');
        }
    );
});

// Función auxiliar para cargar formulario de agregar libro con datos y mensajes
function cargarFormAgregarLibro(name, author_id, category_id, editorial_id, req, res) {
    dbConn.query('SELECT * FROM authors', (err1, authors) => {
        if (err1) authors = [];

        dbConn.query('SELECT * FROM categories', (err2, categories) => {
            if (err2) categories = [];

            dbConn.query('SELECT * FROM editorials', (err3, editorials) => {
                if (err3) editorials = [];

                res.render('books/add', {
                    name,
                    author_id,
                    category_id,
                    editorial_id, // <-- agrega esta línea
                    authors,
                    categories,
                    editorials,
                    year: new Date().getFullYear(),
                    messages: req.flash()
                });
            });
        });
    });
}


// Mostrar formulario para editar libro
router.post('/edit/:id', (req, res) => {
    const id = req.params.id;
    const { name, author_id, category_id, editorial_id, isbn, edition, year, copies } = req.body;
    dbConn.query(
        'UPDATE books SET name=?, author_id=?, category_id=?, editorial_id=?, isbn=?, edition=?, year=?, copies=? WHERE id=?',
        [name, author_id, category_id, editorial_id, isbn, edition, year, copies, id],
        (err) => {
            if (err) {
                req.flash('error', 'Error al actualizar el libro: ' + err.message);
                return res.redirect(`/books/edit/${id}`);
            }
            req.flash('success', 'Libro actualizado correctamente');
            res.redirect('/books');
        }
    );
});
// Mostrar formulario para editar libro
router.get('/edit/:id', (req, res) => {
    const id = req.params.id;
    dbConn.query('SELECT * FROM books WHERE id = ?', [id], (err, results) => {
        if (err || results.length === 0) {
            req.flash('error', err ? 'Error al obtener el libro' : 'Libro no encontrado');
            return res.redirect('/books');
        }
        // Cargar autores, categorías y editoriales para los selects
        dbConn.query('SELECT * FROM authors', (err1, authors) => {
            if (err1) authors = [];
            dbConn.query('SELECT * FROM categories', (err2, categories) => {
                if (err2) categories = [];
                dbConn.query('SELECT * FROM editorials', (err3, editorials) => {
                    if (err3) editorials = [];
                    res.render('books/edit', {
                        book: results[0],
                        authors,
                        categories,
                        editorials,
                        messages: req.flash()
                    });
                });
            });
        });
    });
});
// Procesar formulario para actualizar libro
router.post('/update/:id', (req, res) => {
    const id = req.params.id;
    const { name, author_id, category_id, editorial_id, isbn, edition, year, copies } = req.body;

    if (!name?.trim() || !author_id || !category_id || !editorial_id) {
        return renderFormWithError(
            id, name, author_id, category_id, editorial_id, isbn, edition, year, copies,
            'Por favor ingrese el nombre, autor, categoría y editorial', req, res
        );
    }

    const form_data = {
        name: name.trim(),
        author_id,
        category_id,
        editorial_id,
        isbn,
        edition,
        year,
        copies
    };

    dbConn.query('UPDATE books SET ? WHERE id = ?', [form_data, id], (err) => {
        if (err) {
            return renderFormWithError(
                id, name, author_id, category_id, editorial_id, isbn, edition, year, copies,
                'Error al actualizar libro: ' + err.message, req, res
            );
        }

        req.flash('success', 'Libro actualizado con éxito');
        res.redirect('/books');
    });
});

// Función auxiliar para renderizar formulario de edición con error
function renderFormWithError(id, name, author_id, category_id, editorial_id, isbn, edition, year, copies, errorMsg, req, res) {
    dbConn.query('SELECT * FROM authors', (err1, authors) => {
        if (err1) authors = [];

        dbConn.query('SELECT * FROM categories', (err2, categories) => {
            if (err2) categories = [];

            dbConn.query('SELECT * FROM editorials', (err3, editorials) => {
                if (err3) editorials = [];

                res.render('books/edit', {
                    book: { id, name, author_id, category_id, editorial_id, isbn, edition, year, copies },
                    authors,
                    categories,
                    editorials,
                    messages: { error: [errorMsg] }
                });
            });
        });
    });
}

// --- RUTAS PARA CATEGORÍAS ---
// Ruta para mostrar el formulario de agregar categoría
router.get('/categories/add', (req, res) => {
    res.render('books/categories_add', { name: '', messages: req.flash() });
});

// Agregar categoría
router.post('/categories/add', (req, res) => {
    const name = req.body.name;

    if (!name?.trim()) {
        req.flash('error', 'Por favor ingrese el nombre de la categoría');
        return res.render('books/categories_add', { name, messages: req.flash() });
    }

    dbConn.query('INSERT INTO categories SET ?', { name: name.trim() }, (err) => {
        if (err) {
            req.flash('error', 'Error al agregar categoría: ' + err.message);
            return res.render('books/categories_add', { name, messages: req.flash() });
        }
        req.flash('success', 'Categoría agregada exitosamente');
        res.redirect('/books/categorias'); // o redirige a otra vista si lo prefieres
    });
});

// Eliminar libro
router.get('/delete/:id', (req, res) => {
    const id = req.params.id;
    dbConn.query('DELETE FROM books WHERE id = ?', [id], (err) => {
        if (err) {
            req.flash('error', 'Error al eliminar libro: ' + err.message);
        } else {
            req.flash('success', 'Libro eliminado con éxito!');
        }
        res.redirect('/books');
    });
});

// --- RUTAS PARA AUTORES ---

router.get('/authors_list', (req, res) => {
    dbConn.query('SELECT * FROM authors', (err, autores) => {
        if (err) {
            req.flash('error', 'Error al obtener autores: ' + err.message);
            return res.render('books/authors_list', {
                autores: [],
                libros: [],  // también pasar libros vacío para evitar error
                messages: req.flash()
            });
        }

        // Ahora consultamos la tabla libros para obtener la lista (o solo el conteo)
        dbConn.query('SELECT * FROM books', (err2, libros) => {
            if (err2) {
                req.flash('error', 'Error al obtener libros: ' + err2.message);
                return res.render('books/authors_list', {
                    autores,
                    libros: [],  // vacío para evitar error
                    messages: req.flash()
                });
            }

            // Finalmente renderizamos con autores y libros
            res.render('books/authors_list', {
                autores,
                libros,
                messages: req.flash()
            });
        });
    });
});




// Mostrar formulario para agregar autor
router.get('/authors/add', (req, res) => {
    res.render('books/authors_add', { name: '', messages: req.flash() });
});

// Agregar autor
router.post('/authors/add', (req, res) => {
    const name = req.body.name;

    if (!name?.trim()) {
        req.flash('error', 'Por favor ingrese el nombre del autor');
        return res.render('books/authors_add', { name, messages: req.flash() });
    }

    dbConn.query('INSERT INTO authors SET ?', { name: name.trim() }, (err) => {
        if (err) {
            req.flash('error', 'Error al agregar autor: ' + err.message);
            return res.render('books/authors_add', { name, messages: req.flash() });
        }
        req.flash('success', 'Autor agregado exitosamente');
        res.redirect('/books/add');
    });
});

// Mostrar formulario para editar autor
router.get('/authors/edit/:id', (req, res) => {
    const id = req.params.id;
    dbConn.query('SELECT * FROM authors WHERE id = ?', [id], (err, results) => {
        if (err || results.length === 0) {
            req.flash('error', err ? 'Error al obtener el autor' : 'Autor no encontrado');
            return res.redirect('/books/authors_list');
        }
        res.render('books/authors_edit', { author: results[0], messages: req.flash() });
    });
});

// Actualizar autor
router.post('/authors/update/:id', (req, res) => {
    const id = req.params.id;
    const name = req.body.name;

    if (!name?.trim()) {
        req.flash('error', 'El nombre del autor no puede estar vacío');
        return res.redirect(`/books/authors/edit/${id}`);
    }

    dbConn.query('UPDATE authors SET name = ? WHERE id = ?', [name.trim(), id], (err) => {
        if (err) {
            req.flash('error', 'Error al actualizar el autor: ' + err.message);
            return res.redirect(`/books/authors/edit/${id}`);
        }
        req.flash('success', 'Autor actualizado exitosamente');
        res.redirect('/books/authors_list');
    });
});


//////////////////////////////////////////////////////7
// --- RUTAS PARA EDITORIALES ---

// Mostrar la lista de editoriales
router.get('/editorials', (req, res) => {
    dbConn.query('SELECT * FROM editorials ORDER BY id DESC', (err, editorials) => {
        if (err) {
            req.flash('error', 'Error al obtener las editoriales: ' + err.message);
            return res.render('books/editorials', { data: [], messages: req.flash() });
        }
        res.render('books/editorials', { data: editorials, messages: req.flash() });
    });
});

// Mostrar formulario para agregar editorial
router.get('/editorials/add', (req, res) => {
    res.render('books/editorials_add', { name: '', messages: req.flash() });
});

// Procesar formulario para agregar editorial
router.post('/editorials/add', (req, res) => {
    const name = req.body.name;

    if (!name?.trim()) {
        req.flash('error', 'Por favor ingresa el nombre de la editorial');
        return res.render('books/editorials_add', { name, messages: req.flash() });
    }

    dbConn.query('INSERT INTO editorials SET ?', { name: name.trim() }, (err) => {
        if (err) {
            req.flash('error', 'Error al agregar editorial: ' + err.message);
            return res.render('books/editorials_add', { name, messages: req.flash() });
        }
        req.flash('success', 'Editorial agregada exitosamente');
        res.redirect('/books/editorials');
    });
});

router.get('/editorials/edit/:id', (req, res) => {
    const id = req.params.id;
    dbConn.query('SELECT * FROM editorials WHERE id = ?', [id], (err, results) => {
        if (err || results.length === 0) {
            req.flash('error', err ? 'Error al obtener la editorial' : 'Editorial no encontrada');
            return res.redirect('/books/editorials');
        }
        console.log('Editorial que se envía a la vista:', results[0]); // <- Aquí
        res.render('books/editorials_edit', { editorial: results[0], messages: req.flash() });
    });
});


// Procesar formulario para actualizar editorial
router.post('/editorials/update/:id', (req, res) => {
    const id = req.params.id;
    const name = req.body.name;

    if (!name?.trim()) {
        req.flash('error', 'El nombre de la editorial no puede estar vacío');
        return res.redirect(`/books/editorials/edit/${id}`);
    }

    dbConn.query('UPDATE editorials SET name = ? WHERE id = ?', [name.trim(), id], (err) => {
        if (err) {
            req.flash('error', 'Error al actualizar la editorial: ' + err.message);
            return res.redirect(`/books/editorials/edit/${id}`);
        }
        req.flash('success', 'Editorial actualizada exitosamente');
        res.redirect('/books/editorials');
    });
});

// Eliminar editorial
router.get('/editorials/delete/:id', (req, res) => {
    const id = req.params.id;
    dbConn.query('DELETE FROM editorials WHERE id = ?', [id], (err) => {
        if (err) {
            req.flash('error', 'Error al eliminar la editorial: ' + err.message);
        } else {
            req.flash('success', 'Editorial eliminada con éxito');
        }
        res.redirect('/books/editorials');
    });
});

///////////-----------------Categorias-----------/////////
// Mostrar la lista de categorías
router.get('/categorias', (req, res) => {
    dbConn.query('SELECT * FROM categories ORDER BY id DESC', (err, categorias) => {
        if (err) {
            req.flash('error', 'Error al obtener las categorías: ' + err.message);
            return res.render('books/categorias', { categorias: [], messages: req.flash(), currentPath: '/books/categorias' });
        }
        res.render('books/categorias', { categorias, messages: req.flash(), currentPath: '/books/categorias' });
    });
});

// Mostrar formulario para agregar categoría
router.get('/categories/add', (req, res) => {
    res.render('books/categories_add', { name: '', messages: req.flash(), currentPath: '/books/categories/add' });
});

// Eliminar categoría
router.get('/categories/delete/:id', (req, res) => {
    const id = req.params.id;
    dbConn.query('DELETE FROM categories WHERE id = ?', [id], (err) => {
        if (err) {
            req.flash('error', 'No se puede eliminar la categoría porque tiene libros asociados.');
        } else {
            req.flash('success', 'Categoría eliminada correctamente');
        }
        res.redirect('/books/categorias');
    });
});

// Editar categoría (GET y POST)
router.get('/categories/edit/:id', (req, res) => {
    const id = req.params.id;
    dbConn.query('SELECT * FROM categories WHERE id = ?', [id], (err, result) => {
        if (err || result.length === 0) {
            req.flash('error', 'Categoría no encontrada');
            return res.redirect('/books/categorias');
        }
        res.render('books/categories_edit', { categoria: result[0], messages: req.flash(), currentPath: '/books/categorias' });
    });
});

router.post('/categories/update/:id', (req, res) => {
    const id = req.params.id;
    const { name } = req.body;
    dbConn.query('UPDATE categories SET name = ? WHERE id = ?', [name.trim(), id], (err) => {
        if (err) {
            req.flash('error', 'Error al actualizar la categoría: ' + err.message);
            return res.redirect(`/books/categories/edit/${id}`);
        }
        req.flash('success', 'Categoría actualizada exitosamente');
        res.redirect('/books/categorias');
    });
});

////////////////////////////////////////////////////////

router.post('/login', (req, res) => {
    const { username, password } = req.body;
    dbConn.query('SELECT * FROM users WHERE username = ?', [username], async (err, results) => {
        if (err || results.length === 0) {
            req.flash('error', 'Usuario o contraseña incorrectos o usuario inactivo');
            return res.redirect('/books/login');
        }
        const user = results[0];
        if (user.activo === 0) {
            req.flash('error', 'Usuario o contraseña incorrectos o usuario inactivo');
            return res.redirect('/books/login');
        }
        const match = await bcrypt.compare(password, user.password); // Comparar contraseñas
        if (!match) {
            req.flash('error', 'Usuario o contraseña incorrectos o usuario inactivo');
            return res.redirect('/books/login');
        }
        req.session.user = { id: user.id, username: user.username, role: user.role };
        if (user.role === 'admin') {
            res.redirect('/books');
        } else {
            res.redirect('/books/users/inicio');
        }
    });
});
// Middleware para verificar autenticación de usuario
router.post('/users/add', isAuthenticated, isAdmin, async (req, res) => {
    const { username, password, role, tipo_documento, documento, direccion, telefono } = req.body;

    if (!username?.trim() || !password?.trim() || !role) {
        req.flash('error', 'Todos los campos son obligatorios');
        return res.redirect('/books/users/add');
    }

    try {
        const hash = await bcrypt.hash(password, 10);

        if (role === 'user') {
            dbConn.query(
                'INSERT INTO users (username, password, role, tipo_documento, documento, direccion, telefono) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [username.trim(), hash, role, tipo_documento, documento, direccion, telefono],
                (err) => {
                    if (err) {
                        req.flash('error', 'Error al crear usuario: ' + err.message);
                        return res.redirect('/books/users/add');
                    }
                    req.flash('success', 'Usuario creado correctamente');
                    res.redirect('/books/users/add');
                }
            );
        } else {
            dbConn.query(
                'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
                [username.trim(), hash, role],
                (err) => {
                    if (err) {
                        req.flash('error', 'Error al crear usuario: ' + err.message);
                        return res.redirect('/books/users/add');
                    }
                    req.flash('success', 'Usuario creado correctamente');
                    res.redirect('/books/users/add');
                }
            );
        }
    } catch (error) {
        req.flash('error', 'Error al hashear la contraseña');
        res.redirect('/books/users/add');
    }
});
function isAuthenticated(req, res, next) {
    if (req.session.user) return next();
    res.redirect('/books/login');
}

function isAdmin(req, res, next) {
    if (req.session.user && req.session.user.role === 'admin') return next();
    res.redirect('/books');
}

///--------------------Crear Usuarios------------------------///

router.get('/users/add', isAuthenticated, isAdmin, (req, res) => {
    res.render('users_add', { messages: req.flash() });
});

router.post('/users/add', isAuthenticated, isAdmin, async (req, res) => {
    const { username, password, role } = req.body;

    if (!username?.trim() || !password?.trim() || !role) {
        req.flash('error', 'Todos los campos son obligatorios');
        return res.redirect('/books/users/add');
    }

    try {
        const hash = await bcrypt.hash(password, 10);
        dbConn.query(
            'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
            [username.trim(), hash, role],
            (err) => {
                if (err) {
                    req.flash('error', 'Error al crear usuario: ' + err.message);
                    return res.redirect('/books/users/add');
                }
                req.flash('success', 'Usuario creado correctamente');
                res.redirect('/books/users/add');
            }
        );
    } catch (error) {
        req.flash('error', 'Error al hashear la contraseña');
        res.redirect('/books/users/add');
    }
});


//----------------------- Rutas Usuarios------------------///

// Middleware para verificar autenticación de usuario
function isAuthenticated(req, res, next) {
    if (req.session.user) return next();
    res.redirect('/books/login');
}

function isAdmin(req, res, next) {
    if (req.session.user && req.session.user.role === 'admin') return next();
    res.redirect('/books');
}

// Panel de usuario (inicio)
router.get('/users/inicio', isAuthenticated, (req, res) => {
    res.render('users/inicio', {
        user: req.session.user,
        currentPath: req.path
    });
});

// Mostrar libros disponibles
router.get('/disponibles', isAuthenticated, (req, res) => {
    const userId = req.session.user.id;
    dbConn.query(`
        SELECT books.*, authors.name AS author, categories.name AS category
        FROM books
        LEFT JOIN authors ON books.author_id = authors.id
        LEFT JOIN categories ON books.category_id = categories.id
        WHERE books.copies > 0
        AND books.id NOT IN (
            SELECT book_id FROM loans WHERE user_id = ? AND devuelto = 0
        )
        ORDER BY books.name ASC
    `, [userId], (err, libros) => {
        if (err) libros = [];
        res.render('users/libros_disponibles', { libros, user: req.session.user, messages: req.flash() });
    });
});

// Libros prestados y devolver libros (mis préstamos)
router.get('/loans/my', isAuthenticated, (req, res) => {
    const user_id = req.session.user.id;
    dbConn.query(`
        SELECT loans.*, books.name AS book_name 
        FROM loans 
        JOIN books ON loans.book_id = books.id 
        WHERE loans.user_id = ? 
        ORDER BY loans.fecha_prestamo DESC
    `, [user_id], (err, loans) => {
        if (err) loans = [];
        res.render('loans_my', {
            loans,
            user: req.session.user,
            currentPath: req.path,
            messages: req.flash()
        });
    });
});

// Prestar libro
router.post('/loans/borrow/:book_id', isAuthenticated, (req, res) => {
    const user_id = req.session.user.id;
    const book_id = req.params.book_id;
    dbConn.query('SELECT copies FROM books WHERE id = ?', [book_id], (err, results) => {
        if (err || results.length === 0 || results[0].copies < 1) {
            req.flash('error', 'No hay ejemplares disponibles');
            return res.redirect('/books/disponibles');
        }
        dbConn.query('INSERT INTO loans (user_id, book_id, fecha_prestamo) VALUES (?, ?, CURDATE())', [user_id, book_id], (err2) => {
            if (err2) {
                req.flash('error', 'Error al registrar el préstamo');
                return res.redirect('/books/disponibles');
            }
            dbConn.query('UPDATE books SET copies = copies - 1 WHERE id = ?', [book_id]);
            req.flash('success', 'Libro prestado correctamente');
            res.redirect('/books/loans/my');
        });
    });
});

// Devolver libro
router.post('/loans/return/:loan_id', isAuthenticated, (req, res) => {
    const loan_id = req.params.loan_id;
    dbConn.query('SELECT book_id FROM loans WHERE id = ? AND devuelto = 0', [loan_id], (err, results) => {
        if (err || results.length === 0) {
            req.flash('error', 'Préstamo no encontrado o ya devuelto');
            return res.redirect('/books/loans/my');
        }
        const book_id = results[0].book_id;
        dbConn.query('UPDATE loans SET devuelto = 1, fecha_devolucion = CURDATE() WHERE id = ?', [loan_id]);
        dbConn.query('UPDATE books SET copies = copies + 1 WHERE id = ?', [book_id]);
        req.flash('success', 'Libro devuelto correctamente');
        res.redirect('/books/loans/my');
    });
});

router.get('/login', (req, res) => {
    res.render('login', {
        messages: req.flash(),
        logout: req.query.logout
    });
});

// Cerrar sesión (logout)
router.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/books/login?logout=1');
    });
});

// Mostrar configuración de usuario
router.get('/users/configuracion', isAuthenticated, (req, res) => {
    res.render('users/configuracion', {
        user: req.session.user,
        messages: req.flash(),
        currentPath: '/books/users/configuracion'
    });
});

// Actualizar contraseña
router.post('/users/configuracion', isAuthenticated, (req, res) => {
    const userId = req.session.user.id;
    const { password } = req.body;
    if (!password) {
        req.flash('error', 'La contraseña no puede estar vacía');
        return res.redirect('/books/users/configuracion');
    }
    dbConn.query('UPDATE users SET password = ? WHERE id = ?', [password, userId], (err) => {
        if (err) {
            req.flash('error', 'Error al actualizar la contraseña');
        } else {
            req.flash('success', 'Contraseña actualizada correctamente');
        }
        res.redirect('/books/users/configuracion');
    });
});

///////////////////////////////////////////
// Información de préstamos (admin)
router.get('/loans/all', isAuthenticated, isAdmin, (req, res) => {
    dbConn.query(`
        SELECT loans.*, 
               books.name AS book_name, 
               users.username, 
               users.tipo_documento, 
               users.documento, 
               users.direccion, 
               users.telefono
        FROM loans
        JOIN books ON loans.book_id = books.id
        JOIN users ON loans.user_id = users.id
        ORDER BY loans.fecha_prestamo DESC
    `, (err, loans) => {
        if (err) loans = [];
        res.render('books/loans_all', { loans, messages: req.flash() });
    });
});

//////////////////////////////////////////////////7

router.get('/users/list', isAuthenticated, isAdmin, (req, res) => {
    dbConn.query(
        'SELECT id, username, tipo_documento, documento, activo FROM users ORDER BY id DESC',
        (err, users) => {
            if (err) {
                req.flash('error', 'Error al obtener usuarios');
                return res.render('users_list', { users: [], messages: req.flash(), currentPath: '/books/users/list' });
            }
            res.render('users_list', { users, messages: req.flash(), currentPath: '/books/users/list' });
        }
    );
});

router.get('/users/inactivar/:id', isAuthenticated, isAdmin, (req, res) => {
    const id = req.params.id;
    dbConn.query('UPDATE users SET activo = 0 WHERE id = ?', [id], (err) => {
        if (err) req.flash('error', 'Error al inactivar usuario');
        else req.flash('success', 'Usuario inactivado correctamente');
        res.redirect('/books/users/list');
    });
});

router.get('/users/activar/:id', isAuthenticated, isAdmin, (req, res) => {
    const id = req.params.id;
    dbConn.query('UPDATE users SET activo = 1 WHERE id = ?', [id], (err) => {
        if (err) req.flash('error', 'Error al activar usuario');
        else req.flash('success', 'Usuario activado correctamente');
        res.redirect('/books/users/list');
    });
});

// Mostrar formulario para editar usuario
router.get('/users/edit/:id', isAuthenticated, isAdmin, (req, res) => {
    const userId = req.params.id;

    dbConn.query('SELECT * FROM users WHERE id = ?', [userId], (err, results) => {
        if (err || results.length === 0) {
            req.flash('error', err ? 'Error al obtener el usuario' : 'Usuario no encontrado');
            return res.redirect('/books/users/list');
        }

        res.render('users/users_edit', {
            user: results[0], // Pasar los datos del usuario a la vista
            messages: req.flash(),
        });
    });
});

// Procesar edición de usuario
router.post('/users/edit/:id', isAuthenticated, isAdmin, async (req, res) => {
    const userId = req.params.id;
    const { username, tipo_documento, documento, direccion, telefono, password } = req.body;

    // Construir los datos a actualizar
    const updates = { username, tipo_documento, documento, direccion, telefono };

    try {
        if (password) {
            // Encriptar la nueva contraseña si se proporciona
            const hashedPassword = await bcrypt.hash(password, 10);
            updates.password = hashedPassword;
        }

        dbConn.query('UPDATE users SET ? WHERE id = ?', [updates, userId], (err) => {
            if (err) {
                req.flash('error', 'Error al actualizar el usuario');
            } else {
                req.flash('success', 'Usuario actualizado correctamente');
            }
            res.redirect('/books/users/list');
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Error al procesar la contraseña');
        res.redirect('/books/users/list');
    }
});

///--------------------Descagar PDF------------------------///
const PDFDocument = require('pdfkit');

router.get('/users/list/pdf', async (req, res) => {
    dbConn.query('SELECT username, tipo_documento, documento, activo FROM users', (err, users) => {
        if (err) {
            return res.status(500).send('Error al generar PDF');
        }

        // Crear el PDF
        const doc = new PDFDocument({ margin: 40, size: 'A4' });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=usuarios.pdf');
        doc.pipe(res);

        // Título
        doc
            .fontSize(20)
            .fillColor('#0d6efd')
            .text('Biblioteca Library Life', { align: 'center' })
            .moveDown(0.5);

        doc
            .fontSize(16)
            .fillColor('#222')
            .text('Lista de Usuarios', { align: 'center' })
            .moveDown(1);

        // Encabezados de tabla
        const tableTop = doc.y + 10;
        const col1 = 50, col2 = 180, col3 = 310, col4 = 420;
        doc
            .fontSize(12)
            .fillColor('#fff')
            .rect(col1 - 5, tableTop - 3, 420, 22)
            .fill('#0d6efd')
            .fillColor('#fff')
            .text('Usuario', col1, tableTop, { width: 120, align: 'left' })
            .text('Tipo Doc', col2, tableTop, { width: 120, align: 'left' })
            .text('Número Doc', col3, tableTop, { width: 120, align: 'left' })
            .text('Estado', col4, tableTop, { width: 80, align: 'left' });

        // Línea bajo encabezado
        doc
            .moveTo(col1 - 5, tableTop + 20)
            .lineTo(col1 + 415, tableTop + 20)
            .strokeColor('#0d6efd')
            .lineWidth(1)
            .stroke();

        // Filas de datos
        let y = tableTop + 25;
        users.forEach((user, i) => {
            // Alternar color de fondo para filas
            if (i % 2 === 0) {
                doc.rect(col1 - 5, y - 2, 420, 20).fill('#f5f7fa').fillColor('#222');
            } else {
                doc.fillColor('#222');
            }
            doc
                .fontSize(11)
                .text(user.username, col1, y, { width: 120 })
                .text(user.tipo_documento || '-', col2, y, { width: 120 })
                .text(user.documento || '-', col3, y, { width: 120 })
                .fillColor(user.activo ? '#198754' : '#dc3545')
                .text(user.activo ? 'Activo' : 'Inactivo', col4, y, { width: 80 });
            y += 20;
            doc.fillColor('#222'); // Reset color para la siguiente fila
        });

        // Pie de página
        doc
            .fontSize(10)
            .fillColor('#888')
            .text(`Generado el ${new Date().toLocaleDateString()} por Library Life`, 50, 770, { align: 'center', width: 500 });

        doc.end();
    });
});

///////////////////////////////////////////////////////
router.get('/loans/all/pdf', (req, res) => {
    const query = `
        SELECT u.username, u.tipo_documento, u.documento, u.direccion, u.telefono,
               b.name AS book_name, l.fecha_prestamo, l.devuelto
        FROM loans l
        LEFT JOIN users u ON l.user_id = u.id
        LEFT JOIN books b ON l.book_id = b.id
        ORDER BY l.fecha_prestamo DESC
    `;
    dbConn.query(query, (err, loans) => {
        if (err) return res.status(500).send('Error al generar PDF');

        const doc = new PDFDocument({ margin: 40, size: 'A4' });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=prestamos.pdf');
        doc.pipe(res);

        doc.fontSize(20).fillColor('#0d6efd').text('Library Life', { align: 'center' }).moveDown(0.5);
        doc.fontSize(16).fillColor('#222').text('Préstamos de Usuarios', { align: 'center' }).moveDown(1);

        // Encabezados
        const tableTop = doc.y + 10;
        const col = [40, 120, 200, 280, 360, 440, 520, 600];
        doc.fontSize(10).fillColor('#fff')
            .rect(col[0] - 5, tableTop - 3, 570, 22).fill('#0d6efd')
            .fillColor('#fff')
            .text('Usuario', col[0], tableTop, { width: 80 })
            .text('Tipo Doc', col[1], tableTop, { width: 80 })
            .text('Documento', col[2], tableTop, { width: 80 })
            .text('Dirección', col[3], tableTop, { width: 80 })
            .text('Teléfono', col[4], tableTop, { width: 80 })
            .text('Libro', col[5], tableTop, { width: 80 })
            .text('Fecha', col[6], tableTop, { width: 60 })
            .text('Devuelto', col[7], tableTop, { width: 60 });

        doc.moveTo(col[0] - 5, tableTop + 20).lineTo(col[0] + 565, tableTop + 20)
            .strokeColor('#0d6efd').lineWidth(1).stroke();

        // Filas
        let y = tableTop + 25;
        loans.forEach((loan, i) => {
            if (i % 2 === 0) doc.rect(col[0] - 5, y - 2, 570, 20).fill('#f5f7fa').fillColor('#222');
            else doc.fillColor('#222');
            doc.fontSize(9)
                .text(loan.username || '', col[0], y, { width: 80 })
                .text(loan.tipo_documento || '', col[1], y, { width: 80 })
                .text(loan.documento || '', col[2], y, { width: 80 })
                .text(loan.direccion || '', col[3], y, { width: 80 })
                .text(loan.telefono || '', col[4], y, { width: 80 })
                .text(loan.book_name || '', col[5], y, { width: 80 })
                .text(loan.fecha_prestamo ? loan.fecha_prestamo.toISOString().slice(0, 10) : '', col[6], y, { width: 60 })
            const devueltoBool = loan.devuelto == 1 || loan.devuelto === true;
            doc
                .fillColor(devueltoBool ? '#198754' : '#dc3545')
                .text(devueltoBool ? 'Sí' : 'No', col[7], y, { width: 60 });
            y += 20;
            doc.fillColor('#222');
        });

        doc.fontSize(10).fillColor('#888')
            .text(`Generado el ${new Date().toLocaleDateString()} por Library Life`, 40, 770, { align: 'center', width: 520 });

        doc.end();
    });
});

///----------------Ruta de Enviar Correo------------------------///

const nodemailer = require('nodemailer');

// ...otros requires y rutas...

router.post('/soporte', async (req, res) => {
    const { nombre, identificacion, correo, descripcion } = req.body;
    const fecha = new Date();

    try {
        // 1. Verificar si el usuario existe en la tabla de usuarios (ajusta el nombre de la tabla y columna)
        const [usuario] = await new Promise((resolve, reject) => {
            const query = 'SELECT * FROM users WHERE documento = ? LIMIT 1';
            dbConn.query(query, [identificacion], (err, results) => {
                if (err) reject(err);
                else resolve(results);
            });
        });

        if (!usuario) {
            return res.json({ success: false, message: 'Usted no es un usuario de la biblioteca.' });
        }

        // 2. Verificar si hay un soporte enviado en las últimas 48 horas por este usuario
        const [ultimoSoporte] = await new Promise((resolve, reject) => {
            const query = `
                SELECT fecha FROM soporte 
                WHERE identificacion = ? 
                ORDER BY fecha DESC 
                LIMIT 1
            `;
            dbConn.query(query, [identificacion], (err, results) => {
                if (err) reject(err);
                else resolve(results);
            });
        });

        if (ultimoSoporte) {
            const fechaUltimoSoporte = new Date(ultimoSoporte.fecha);
            const horasDiferencia = (fecha - fechaUltimoSoporte) / (1000 * 60 * 60);
            if (horasDiferencia < 48) {
                return res.json({ success: false, message: `Ya has enviado una solicitud en las últimas 48 horas. Por favor espera ${Math.ceil(48 - horasDiferencia)} horas.` });
            }
        }

        // 3. Guardar en la base de datos la nueva solicitud de soporte
        const insertResult = await new Promise((resolve, reject) => {
            const insertQuery = `
                INSERT INTO soporte (nombre, identificacion, correo, descripcion, fecha)
                VALUES (?, ?, ?, ?, ?)
            `;
            dbConn.query(insertQuery, [nombre, identificacion, correo, descripcion, fecha], (err, result) => {
                if (err) reject(err);
                else resolve(result);
            });
        });

        // 4. Enviar correos (igual que antes)
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: 'soporte.librarylife@gmail.com',
                pass: 'bwvaxuydyrppwsse'
            }
        });

        const mailOptions = {
            from: correo,
            to: 'soporte.librarylife@gmail.com',
            subject: 'Soporte - Problema de inicio de sesión u otro',
            html: `
                <h3>Nuevo reporte de problema</h3>
                <b>Radicado:</b> ${insertResult.insertId} <br>
                <b>Fecha:</b> ${fecha.toLocaleString()} <br>
                <b>Nombre:</b> ${nombre} <br>
                <b>Identificación:</b> ${identificacion} <br>
                <b>Correo:</b> ${correo} <br>
                <b>Descripción:</b> <br>
                <pre>${descripcion}</pre>
            `
        };

        const mailUser = {
            from: 'soporte.librarylife@gmail.com',
            to: correo,
            subject: 'Radicado de soporte Biblioteca Life',
            html: `
                <h3>¡Hola, ${nombre}!</h3>
                <p>Hemos recibido tu solicitud de soporte.</p>
                <b>Radicado:</b> ${insertResult.insertId}<br>
                <b>Fecha:</b> ${fecha.toLocaleString()}<br>
                <p>Pronto te daremos una respuesta en los próximos 8 días hábiles.</p>
                <p>Gracias por contactarnos.<br>Biblioteca Life</p>
            `
        };

        await transporter.sendMail(mailOptions);
        await transporter.sendMail(mailUser);

        res.json({ success: true, message: 'Mensaje enviado correctamente. Pronto nos pondremos en contacto.' });

    } catch (error) {
        console.error('Error en /soporte:', error);
        res.json({ success: false, message: 'Ocurrió un error, intenta más tarde.' });
    }
});


///-------------------------Ruta Reporte.ejs------------------------///
router.get('/reporte', (req, res) => {
    const query = 'SELECT * FROM soporte ORDER BY fecha DESC';

    dbConn.query(query, (err, results) => {
        if (err) {
            console.error('Error al obtener los reportes:', err);
            return res.status(500).send('Error del servidor al obtener reportes');
        }

        res.render('reporte', { reportes: results || [] });
    });
});

router.post('/reporte/estado/:id', (req, res) => {
    console.log('Ruta POST /reporte/estado/:id alcanzada');

    const reporteId = req.params.id;
    const nuevoEstado = req.body.estado;

    const updateQuery = 'UPDATE soporte SET estado = ? WHERE id = ?';

    dbConn.query(updateQuery, [nuevoEstado, reporteId], (err, result) => {
        if (err) {
            console.error('Error al actualizar el estado:', err);
            return res.status(500).send('Error al cambiar el estado');
        }
        res.redirect('/books/reporte');
    });
});
module.exports = router;
