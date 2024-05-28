const express = require('express');
const router = express.Router();
const multer = require('multer');
const mysql = require('mysql');
const fs = require('fs');
const path = require('path');

// MySQL connection setup
const connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'project',
});

router.use('/uploads', express.static('uploads'));
// Multer configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/'); // Uploads folder
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname); // Unique filename
  },
});

const upload = multer({ storage: storage });

// Middleware to check authentication
function authenticate(req, res, next) {
  console.log(`requestuserId: ${req.session.userId}}`);
  if (!req.session.userId) {
    // return res.redirect('/');
  }
  next();
}

// Route for rendering dashboard with uploaded files and folders
router.get('/dashboard', authenticate, (req, res) => {
  // Fetch uploaded files and folders from MySQL database
  connection.query('SELECT * FROM items', (error, results, fields) => {
    if (error) {
      console.error('Error fetching items from database:', error);
      return res.status(500).send('Internal Server Error');
    }

    // Render dashboard template with uploaded files and folders
    res.render('dashboard', { items: results, loggedInUserId: req.session.userId });
  });
});

// Route for handling file upload
router.post('/upload', authenticate, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).send('No file uploaded.');
  }

  // File metadata
  const fileData = {
    name: req.file.filename,
    type: 'file',
    user_id: req.session.userId,
  };

  // Save file metadata to MySQL database
  connection.query('INSERT INTO items SET ?', fileData, (error, results, fields) => {
    if (error) {
      console.error('Error saving file to database:', error);
      return res.status(500).send('Internal Server Error');
    }
    res.redirect('/dashboard');
  });
});

// Route for creating folder
router.post('/createFolder', authenticate, (req, res) => {
  const folderName = req.body.folderName;
  const userId = req.session.userId;
  const parentFolderId = req.body.parentFolderId; // ID of the parent folder, if applicable

  if (!folderName) {
    return res.status(400).send('Folder name is required.');
  }

  const folderData = {
    name: folderName,
    type: 'folder',
    parent_folder_id: parentFolderId,
    user_id: userId,
  };

  connection.query('INSERT INTO items SET ?', folderData, (error, results, fields) => {
    if (error) {
      console.error('Error creating folder:', error);
      return res.status(500).send('Internal Server Error');
    }

    // Create the folder in the server directory
    const folderPath = path.join(__dirname, 'uploads', folderName); // Adjust the directory path as needed
    fs.mkdir(folderPath, (err) => {
      if (err) {
        console.error('Error creating folder:', err);
        return res.status(500).send('Internal Server Error');
      }
      res.redirect('/dashboard');
    });
  });
});

// Route for renaming an item (file or folder)
router.post('/rename', authenticate, (req, res) => {
  const itemId = req.body.itemId;
  const newName = req.body.newName;

  if (!itemId || !newName) {
    return res.status(400).send('Invalid input.');
  }

  // Get the item details from the database
  connection.query('SELECT * FROM items WHERE item_id = ?', [itemId], (error, results, fields) => {
    if (error || results.length === 0) {
      console.error('Error fetching item details:', error);
      return res.status(500).send('Internal Server Error');
    }

    const item = results[0];

    // Update the item name in the database
    connection.query('UPDATE items SET name = ? WHERE item_id = ?', [newName, itemId], (error, results, fields) => {
      if (error) {
        console.error('Error renaming item:', error);
        return res.status(500).send('Internal Server Error');
      }

      // If the item is a file, rename the file in the file system
      if (item.type === 'file') {
        const oldFilePath = path.join(__dirname, 'uploads', item.name);
        const newFilePath = path.join(__dirname, 'uploads', newName);
        fs.rename(oldFilePath, newFilePath, (err) => {
          if (err) {
            console.error('Error renaming file:', err);
            return res.status(500).send('Internal Server Error');
          }
          res.redirect('/dashboard');
        });
      }
      // If the item is a folder, rename the folder in the file system
      else if (item.type === 'folder') {
        const oldFolderPath = path.join(__dirname, 'uploads', item.name);
        const newFolderPath = path.join(__dirname, 'uploads', newName);
        fs.rename(oldFolderPath, newFolderPath, (err) => {
          if (err) {
            console.error('Error renaming folder:', err);
            return res.status(500).send('Internal Server Error');
          }
          // Update the paths of all files and subfolders contained within the folder
          connection.query('UPDATE items SET name = REPLACE(name, ?, ?) WHERE name LIKE ?', [item.name, newName, item.name + '%'], (error, results, fields) => {
            if (error) {
              console.error('Error updating item paths:', error);
              return res.status(500).send('Internal Server Error');
            }
            res.redirect('/dashboard');
          });
        });
      }
    });
  });
});

// Route for handling item deletion
// Route for handling item deletion
router.delete('/deleteItem/:itemId', authenticate, (req, res) => {
  const itemId = req.params.itemId;

  if (!itemId) {
    return res.status(400).send('Item ID is required.');
  }

  // Fetch item details from the database
  connection.query('SELECT * FROM items WHERE item_id = ?', [itemId], (error, results, fields) => {
    if (error || results.length === 0) {
      console.error('Error fetching item details:', error);
      return res.status(500).send('Internal Server Error');
    }

    const item = results[0];

    // If the item is a file, delete it from the file system
    if (item.type === 'file') {
      const filePath = path.join(__dirname, 'uploads', item.name);
      fs.unlink(filePath, (err) => {
        if (err) {
          console.error('Error deleting file:', err);
          return res.status(500).send('Internal Server Error');
        }

        // Delete the item from the database after successfully deleting the file
        connection.query('DELETE FROM items WHERE item_id = ?', [itemId], (error, results, fields) => {
          if (error) {
            console.error('Error deleting item from database:', error);
            return res.status(500).send('Internal Server Error');
          }
          res.sendStatus(200);
        });
      });
    }
    // If the item is a folder, delete it recursively from the file system
    else if (item.type === 'folder') {
      const folderPath = path.join(__dirname, 'uploads', item.name);
      fs.rmdir(folderPath, { recursive: true }, (err) => {
        if (err) {
          console.error('Error deleting folder:', err);
          return res.status(500).send('Internal Server Error');
        }

        // Delete the associated table for the folder
        const folderFilesTable = `folder_files_${item.name}`;
        connection.query(`DROP TABLE IF EXISTS ${folderFilesTable}`, (error, results, fields) => {
          if (error) {
            console.error('Error deleting folder table:', error);
            return res.status(500).send('Internal Server Error');
          }

          // Delete all items contained within the folder from the database
          connection.query('DELETE FROM items WHERE name LIKE ?', [item.name + '/%'], (error, results, fields) => {
            if (error) {
              console.error('Error deleting items from database:', error);
              return res.status(500).send('Internal Server Error');
            }

            // Delete the folder from the database after successfully deleting all contained items
            connection.query('DELETE FROM items WHERE item_id = ?', [itemId], (error, results, fields) => {
              if (error) {
                console.error('Error deleting folder from database:', error);
                return res.status(500).send('Internal Server Error');
              }
              res.sendStatus(200);
            });
          });
        });
      });
    }
  });
});
// Route for rendering folder contents
router.get('/:folderName/folderContent', authenticate, (req, res) => {
  const folderName = req.params.folderName;

  // Assuming you have the logged-in user ID available in your session or request object
  const loggedInUserId = req.session.userId;

  // Check if the folder files table exists
  const folderFilesTable = `folder_files_${folderName}`;
  connection.query(`SHOW TABLES LIKE '${folderFilesTable}'`, (error, results, fields) => {
    if (error) {
      console.error('Error checking folder files table:', error);
      return res.status(500).send('Internal Server Error');
    }

    if (results.length === 0) {
      // Table doesn't exist, handle accordingly (e.g., render folder content with no files)
      return res.render('folderContents', { folderName: folderName, files: [], loggedInUserId: loggedInUserId });
    }

    // Fetch contents of the folder from the corresponding folder files table
    connection.query(`SELECT * FROM ${folderFilesTable}`, (error, results, fields) => {
      if (error) {
        console.error('Error fetching folder contents:', error);
        return res.status(500).send('Internal Server Error');
      }

      // Render folder contents template with the fetched results and logged-in user ID
      res.render('folderContents', { folderName: folderName, files: results, loggedInUserId: loggedInUserId });
    });
  });
});

// Route for handling file upload to folders
router.post('/:folderName/uploadFolder', authenticate, upload.array('files', 10), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).send('No files uploaded.');
  }

  const folderName = req.params.folderName;

  const filesData = req.files.map(file => ({
    name: file.originalname,
    type: 'file',
    user_id: req.session.userId,
    folder_name: folderName // Store folder name with each file
  }));

  // Save file metadata to the appropriate folder files table
  const folderFilesTable = `folder_files_${folderName}`; // Name of the table for the folder

  connection.query(`CREATE TABLE IF NOT EXISTS ${folderFilesTable} (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,
    user_id INT NOT NULL
  )`, (error, results, fields) => {
    if (error) {
      console.error('Error creating folder files table:', error);
      return res.status(500).send('Internal Server Error');
    }

    // Insert file metadata into the folder_files table
    connection.query(`INSERT INTO ${folderFilesTable} (name, type, user_id) VALUES ?`, [filesData.map(file => [file.name, file.type, file.user_id])], (error, results, fields) => {
      if (error) {
        console.error('Error saving files to database:', error);
        return res.status(500).send('Internal Server Error');
      }

      // Create the folder if it doesn't exist
      const folderPath = path.join(__dirname, 'uploads', folderName);
      fs.mkdir(folderPath, { recursive: true }, (err) => {
        if (err) {
          console.error('Error creating folder:', err);
          return res.status(500).send('Internal Server Error');
        }

        // Move uploaded files to the folder
        req.files.forEach(file => {
          const oldPath = file.path;
          const newPath = path.join(folderPath, file.originalname);
          fs.rename(oldPath, newPath, (err) => {
            if (err) {
              console.error('Error moving file to folder:', err);
              return res.status(500).send('Internal Server Error');
            }
          });
        });

        res.redirect(`/${folderName}/folderContent`);
      });
    });
  });
});

// Route for deleting a file
router.delete('/:folderName/deleteFile/:fileName', authenticate, (req, res) => {
  const folderName = req.params.folderName;
  const fileName = req.params.fileName;

  if (!folderName || !fileName) {
    return res.status(400).send('Invalid input.');
  }

  const folderFilesTable = `folder_files_${folderName}`;

  // Delete the file entry from the MySQL table
  connection.query(`DELETE FROM ${folderFilesTable} WHERE name = ?`, [fileName], (error, results, fields) => {
    if (error) {
      console.error('Error deleting file from database:', error);
      return res.status(500).send('Internal Server Error');
    }

    // Delete the file locally
    const filePath = path.join(__dirname, 'uploads', folderName, fileName);

    fs.unlink(filePath, (err) => {
      if (err) {
        console.error('Error deleting file locally:', err);
        return res.status(500).send('Internal Server Error');
      }
      res.sendStatus(200); // Success
    });
  });
});

module.exports = router;
