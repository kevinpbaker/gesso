---
'gesso-vite-plugin': patch
---

A page reloaded after saving a service's module no longer fails with "Service '…' is not registered. A different class of that name is registered". The render worker accepts its services' modules, and Vite leaves a module that accepts an update importing the version from before the save while every other importer moves on, so the reloaded page ran two copies of the service's module, and kept doing so until the dev server restarted. The plugin now keeps the worker entry's imports at the version the rest of the graph imports.
