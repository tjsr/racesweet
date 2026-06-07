# Data Flow

When the user interacts with any control within the application, it should call an action which is responsible for validating any changes.  After the data is validated, it will then write that change to the ledger applicable to that data type.  It will then do two things:
1.  Update the model of the application state, which is the source of truth for the connected clients.
2.  Call any upstream parent data stores, such as the cloud provider, which will be the same implementation as our local data store.  That remote will also have its own version of the ledger, and any clients connected directly to that provider will have events sent down to them.

The remote server will never send UI events back to the client where the change event originated, as the local controller is responsible for changes to that client.  This is to prevent any potential duplication of events.

If the remote receives model update events from another client, it should send those to all other clients, and they will both write those events to their own ledger, and update their local model state, firing any relevant flow-on events.

It is not mandatory that the client has a connection to an upstream remote provider.  When a client connects to a remote, it should sync the current state of the model, pushing local events the client knows about which the server does not have, and pulling any events the server has which the client does not have.  After this initial sync, the client should be up to date with the current state of the model, and any new events should be sent to the server as they occur. Events received from the remote during steady-state must be applied in the order defined by their ledger sequence number. If an event arrives with a sequence number that is not contiguous with the last applied sequence number, the client must buffer it and wait for the missing entries before applying the buffered events.
