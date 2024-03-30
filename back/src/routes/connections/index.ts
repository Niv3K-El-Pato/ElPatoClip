import { z } from 'zod';
import { app, handleError } from '../..';
import { ConnectionServices, getConnections } from '../../api/authApi';
import { getUserIdFromToken } from '../../getUserFromToken';
import { getAllowedConnectionsHandler } from './handlers/getAllowedConnectionsHandler';
import { deleteConnectionHandler } from './handlers/deleteConnectionHandler';
import { postConnectionHandler } from './handlers/postConnectionHandler';

app.post('/user/connection/:connectionType', async (req, res) => {
  try {
    const userId = getUserIdFromToken(req.headers);
    if (!userId) return res.status(401).send();

    const connectionType = z.nativeEnum(ConnectionServices).parse(req.params.connectionType);
    const { code, redirectUrl } = z.object({
      code: z.string(),
      redirectUrl: z.string()
    }).parse(req.body);

    await postConnectionHandler(userId, connectionType, code, redirectUrl);
    return res.status(201).send();
  } catch(err) {
    handleError(err, res);
  }
});

app.delete('/user/connection/:connectionType', async (req, res) => {
  try {
    const userId = getUserIdFromToken(req.headers);
    if (!userId) return res.status(401).send();
    const connectionType = z.nativeEnum(ConnectionServices).parse(req.params.connectionType);

    await deleteConnectionHandler(userId, connectionType);
    return res.status(200).send();
  } catch(err) {
    handleError(err, res);
  }
});

app.get('/user/allowed-connections', async (req, res) => {
  try {
    const userId = getUserIdFromToken(req.headers);
    if (!userId) return res.status(401).send();
    const connections = await getConnections(userId);
    if (!connections) return res.status(500).send();

    const data = await getAllowedConnectionsHandler(userId);
    res.status(200).send(data);
  } catch(err) {
    handleError(err, res);
  }
});