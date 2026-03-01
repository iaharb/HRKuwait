---
description: Start HR Portal Services
---

# Steps to start the portal services

1. **Prerequisites**
   - Ensure Docker Desktop (or Docker Engine) is installed and running on your machine.
   - Ensure you have pulled the required images (they will be pulled automatically on first run).

2. **Install project dependencies** (if you haven't already):
   ```bash
   npm install
   ```

3. **Start the services with Docker Compose**
   // turbo
   ```bash
   docker compose up -d
   ```
   This builds the `portal-app-v3` image (if not built) and starts the `portal-app-v3`, `ollama`, and `open-webui` containers in the background.

4. **Verify that containers are running**
   ```bash
   docker compose ps
   ```
   You should see `hrportal-app-v3`, `hrportal-ollama`, and `hrportal-webui` with status `Up`.

5. **Access the portal**
   Open your browser and navigate to **http://localhost:8080**. The Vite‑served React app will be available.

6. **Optional: View logs**
   ```bash
   docker compose logs -f portal-app-v3
   ```
   Press `Ctrl+C` to stop following logs.

7. **Stop the services**
   ```bash
   docker compose down
   ```
   This stops and removes the containers (but keeps the built images).

---

*You can run the `docker compose up -d` command directly from your terminal. The `// turbo` annotation indicates this step can be auto‑executed by the workflow runner.*
