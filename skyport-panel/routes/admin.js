/**
 * @fileoverview This module sets up administrative routes for managing and monitoring server nodes
 * within the network. It provides functionality to create, delete, and debug nodes, as well as check
 * their current status. User authentication and admin role verification are enforced for access to
 * these routes.
 */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const { db } = require('../handlers/db.js');
const config = require('../config.json');
const bcrypt = require('bcrypt');
const saltRounds = process.env.SALT_ROUNDS || 10;

/**
 * Middleware to verify if the user is an administrator.
 * Checks if the user object exists and if the user has admin privileges. If not, redirects to the
 * home page. If the user is an admin, proceeds to the next middleware or route handler.
 *
 * @param {Object} req - The request object, containing user data.
 * @param {Object} res - The response object.
 * @param {Function} next - The next middleware or route handler to be executed.
 * @returns {void} Either redirects or proceeds by calling next().
 */
function isAdmin(req, res, next) {
  if (!req.user || req.user.admin !== true) {
    return res.redirect('../');
  }
  next();
}

async function doesUserExist(username) {
  const users = await db.get('users');
  if (users) {
      return users.some(user => user.username === username);
  } else {
      return false; // If no users found, return false
  }
}

/**
 * Checks the operational status of a node by making an HTTP request to its API.
 * Updates the node's status based on the response or sets it as 'Offline' if the request fails.
 * This status check and update are persisted in the database.
 *
 * @param {Object} node - The node object containing details such as address, port, and API key.
 * @returns {Promise<Object>} Returns the updated node object after attempting to verify its status.
 */
async function checkNodeStatus(node) {
  try {
    const RequestData = {
      method: 'get',
      url: 'http://' + node.address + ':' + node.port + '/',
      auth: {
        username: 'Skyport',
        password: node.apiKey
      },
      headers: { 
        'Content-Type': 'application/json'
      }
    };
    const response = await axios(RequestData);
    const { versionFamily, versionRelease, online, remote, docker } = response.data;

    node.status = 'Online';
    node.versionFamily = versionFamily;
    node.versionRelease = versionRelease;
    node.remote = remote;
    node.docker = docker;

    await db.set(node.id + '_node', node); // Update node info with new details
    return node;
  } catch (error) {
    node.status = 'Offline';
    await db.set(node.id + '_node', node); // Update node as offline if there's an error
    return node;
  }
}

/**
 * GET /nodes/debug
 * Asynchronously retrieves and updates the status of all nodes registered in the database.
 * Available only to administrators. The status of each node is checked and updated through a
 * specific function call which queries the node's API.
 *
 * @returns {Response} Returns a JSON array of all nodes with their updated statuses.
 */
router.get('/nodes/debug', isAdmin, async (req, res) => {
  const nodeIds = await db.get('nodes') || [];
  const nodes = await Promise.all(nodeIds.map(id => db.get(id + '_node').then(checkNodeStatus)));
  res.json(nodes);
});

/**
 * GET /account/debug
 * Provides debug information about the currently logged-in user. Available only to administrators.
 * Ensures that user data is available in the request object, then returns this data in JSON format.
 *
 * @returns {Response} Returns a JSON object containing user details if available; otherwise, sends a debug error message.
 */
router.get('/account/debug', isAdmin, async (req, res) => {
  if (!req.user) res.send('no req.user present!')
  res.json(req.user);
});

/**
 * GET /admin/overview
 * Retrieves counts of users, nodes, images, and instances from the database.
 * Available only to administrators and renders an overview page displaying the counts.
 *
 * @returns {Response} Renders the 'overview' view with the total counts.
 */
router.get('/admin/overview', isAdmin, async (req, res) => {
  try {
      const users = await db.get('users') || [];
      const nodes = await db.get('nodes') || [];
      const images = await db.get('images') || [];
      const instances = await db.get('instances') || [];

      // Calculate the total number of each type of object
      const usersTotal = users.length;
      const nodesTotal = nodes.length;
      const imagesTotal = images.length;
      const instancesTotal = instances.length;

      res.render('admin/overview', { req, user: req.user, usersTotal, nodesTotal, imagesTotal, instancesTotal, version: config.version, name: await db.get('name') || 'Skyport' });
  } catch (error) {
      res.status(500).send({ error: 'Failed to retrieve data from the database.' });
  }
});

/**
 * POST /nodes/create
 * Creates a new node with specified parameters from the request body, such as name, hardware specifications,
 * and API credentials. After creation, the node's operational status is checked and updated. The new node is
 * then saved in the database. This route is secured and available only to administrators.
 *
 * @returns {Response} Sends the newly created and status-updated node data.
 */
router.post('/nodes/create', isAdmin, async (req, res) => {
  const node = {
    id: uuidv4(),
    name: req.body.name,
    tags: req.body.tags,
    ram: req.body.ram,
    disk: req.body.disk,
    processor: req.body.processor,
    address: req.body.address,
    port: req.body.port,
    apiKey: req.body.apiKey,
    status: 'Unknown' // Default status
  };

  if (!req.body.name || !req.body.tags || !req.body.ram || !req.body.disk || !req.body.processor || !req.body.address || !req.body.port || !req.body.apiKey) return res.send('Form validation failure.')

  await db.set(node.id + '_node', node); // Save the initial node info
  const updatedNode = await checkNodeStatus(node); // Check and update status

  const nodes = await db.get('nodes') || [];
  nodes.push(node.id);
  await db.set('nodes', nodes);

  res.status(201).send(updatedNode);
});

router.post('/users/create', isAdmin, async (req, res) => {
  const user = {
    userId: uuidv4(),
    username: req.body.username,
    password: await bcrypt.hash(req.body.password, saltRounds),
    admin: req.body.admin, 
};

if (!req.body.username || !req.body.password) {
  return res.send('Username and password are required.');
}

if (req.body.admin !== true && req.body.admin !== false) {
  return res.send('Other values as true or false are not allowed!');
}


const userExists = await doesUserExist(req.body.username);
if (userExists) {
  return res.send("user already exists!");
}

let users = await db.get('users') || [];
users.push(user);
await db.set('users', users);

console.log(user)

res.status(201).send(user);
});

router.delete('/user/delete', isAdmin, async (req, res) => {
  const userId = req.body.userId;
  const users = await db.get('users') || [];

  const userIndex = users.findIndex(user => user.userId === userId);

  if (userIndex === -1) {
    return res.status(400).send('The specified user does not exist');
  }

  users.splice(userIndex, 1);
  await db.set('users', users);
  res.status(204).send();
});


/**
 * DELETE /nodes/delete
 * Deletes a node from the database based on its identifier provided in the request body. Updates the list of
 * all nodes in the database to reflect this deletion. This operation is restricted to administrators.
 *
 * @returns {Response} Sends a status response indicating the successful deletion of the node.
 */
router.delete('/nodes/delete', isAdmin, async (req, res) => {
  const nodeId = req.body.nodeId;
  const nodes = await db.get('nodes') || [];
  const newNodes = nodes.filter(id => id !== nodeId);

  if (!nodeId) return res.send('Invalid node')

  await db.set('nodes', newNodes);
  await db.delete(nodeId + '_node');

  res.status(204).send();
});

/**
 * GET /admin/nodes
 * Retrieves a list of all nodes, checks their statuses, and renders an admin page to display these nodes.
 * This route is protected and allows only administrators to view the node management page.
 *
 * @returns {Response} Renders the 'nodes' view with node data and user information.
 */
router.get('/admin/nodes', isAdmin, async (req, res) => {
  let nodes = await db.get('nodes') || [];
  let instances = await db.get('instances') || [];
  let set = {};
  nodes.forEach(function(node) {
	  set[node] = 0;
	  instances.forEach(function(instance) {
		if (instance.Node.id == node) {
			set[node]++;
		}
	  });
  });
  nodes = await Promise.all(nodes.map(id => db.get(id + '_node').then(checkNodeStatus)));

  res.render('admin/nodes', { req, user: req.user, nodes, set, name: await db.get('name') || 'Skyport' });
});


/**
 * GET /admin/settings
 * Settings page. This route is protected and allows only administrators to view the settings page.
 *
 * @returns {Response} Renders the 'nodes' view with node data and user information.
 */
router.get('/admin/settings', isAdmin, async (req, res) => {


  res.render('admin/settings', { req, user: req.user, name: await db.get('name') || 'Skyport' });
});

router.post('/admin/settings/change/name', isAdmin, async (req, res) => {
  const name = req.body.name;
  try {
  await db.set('name', [name]);
  res.redirect('/admin/settings?changednameto=' + name);
} catch (err) {
  console.error(err);
  res.status(500).send("Database error");
}
});

/**
 * GET /admin/instances
 * Retrieves a list of all instances, checks their statuses, and renders an admin page to display these instances.
 * This route is protected and allows only administrators to view the instance management page.
 *
 * @returns {Response} Renders the 'instances' view with instance data and user information.
 */
router.get('/admin/instances', isAdmin, async (req, res) => {
  let instances = await db.get('instances') || [];
  let images = await db.get('images') || [];
  let nodes = await db.get('nodes') || [];
  let users = await db.get('users') || [];

  nodes = await Promise.all(nodes.map(id => db.get(id + '_node').then(checkNodeStatus)));

  res.render('admin/instances', { req, user: req.user, instances, images, nodes, users, name: await db.get('name') || 'Skyport' });
});

router.get('/admin/users', isAdmin, async (req, res) => {
  let users = await db.get('users') || [];

  res.render('admin/users', { req, user: req.user, users, name: await db.get('name') || 'Skyport' });
});

/**
 * GET /admin/node/:id
 * Renders the page for a specific node identified by its unique ID.
 * The endpoint retrieves the node details from the database,
 * and renders the 'admin/node' view with the retrieved data.
 *
 * @param {string} id - The unique identifier of the node to fetch.
 * @returns {Response} Redirects to the nodes overview page if the node does not exist
 * or the ID is not provided. Otherwise, renders the node page with appropriate data.
 */
 
router.get("/admin/node/:id", async (req, res) => {
    const { id } = req.params;
    const node = await db.get(id + '_node');

    if (!node || !id) return res.redirect('../nodes')

    res.render('admin/node', { req, node, user: req.user, name: await db.get('name') || 'Skyport' });
});


/**
 * POST /admin/node/:id
 * Edit an existing node with specified parameters from the request body, such as name, hardware specifications.
 *
 * @returns {Response} Sends the node data if all goes ok else 400 if the node doesn't exist.
 */
 
router.post("/admin/node/:id", async (req, res) => {

	const { id } = req.params;
	const cnode = await db.get(id + '_node');

    if (!cnode || !id) return res.status(400).send();
	
    const node = {
		id: id,
		name: req.body.name,
		tags: req.body.tags,
		ram: req.body.ram,
		disk: req.body.disk,
		processor: req.body.processor,
		address: req.body.address,
		port: req.body.port,
		apiKey: req.body.apiKey,
		status: 'Unknown' // Default status
	};

    await db.set(node.id + '_node', node); 
	const updatedNode = await checkNodeStatus(node);
	res.status(201).send(updatedNode);
});

/**
 * GET /admin/images
 *
 * @returns {Response} Renders the 'images' view with image data.
 */
router.get('/admin/images', isAdmin, async (req, res) => {
  let images = await db.get('images') || [];

  res.render('admin/images', { req, user: req.user, images, name: await db.get('name') || 'Skyport' });
});

module.exports = router;
