# Open Cinema UI

Home cinema control system with two UIs: an admin panel for device management and an on-screen interface for basic cinema controls.

## Project Structure

```
open-cinema-ui/
├── apps/
│   ├── admin/          # Admin panel (Refine + Ant Design) - Port 3000
│   └── ui/             # On-screen cinema UI - Port 3001
├── packages/
│   └── shared/         # Shared API client, types, and hooks
└── package.json        # Monorepo root
```

## Tech Stack

- **Vite** - Fast build tool
- **React 18** - UI framework
- **TypeScript** - Type safety
- **npm workspaces** - Monorepo management

### Admin Panel
- **Refine** - CRUD framework
- **Ant Design** - UI components
- **TanStack Query** - Server state management

### Cinema UI
- **TanStack Query** - Server state management
- **Zustand** - Client state management

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Build Shared Package

**IMPORTANT:** You must build the shared package before running the apps:

```bash
npm run build --workspace=packages/shared
```

### 3. Configure Environment

Copy the example env files and set your backend API URL:

```bash
# Admin panel
cp apps/admin/.env.example apps/admin/.env

# Cinema UI
cp apps/ui/.env.example apps/ui/.env
```

Edit the `.env` files and set:
```
VITE_API_URL=http://localhost:8000/api
```

### 4. Start Development

Run both apps:
```bash
npm run dev
```

Or run individually:
```bash
npm run dev:admin  # Admin panel on http://localhost:3000
npm run dev:ui     # Cinema UI on http://localhost:3001
```

## Admin Panel Features

- **Device List** (`/devices`) - Read-only table showing all devices
- **Refresh Button** - Triggers device discovery on backend (`POST /api/devices/refresh`)
- **Create Device** (`/devices/create`) - Simple form to add new devices

## Cinema UI Features

- Source selection (HDMI 1-3, Optical)
- Volume control with slider
- Fullscreen optimized interface

## Backend API Requirements

The backend must implement these endpoints:

### Devices
- `GET /api/devices` - List all devices
- `POST /api/devices` - Create device
  ```json
  {
    "name": "Living Room Amplifier",
    "type": "amplifier" | "source" | "display" | "processor"
  }
  ```
- `POST /api/devices/refresh` - Trigger device discovery/refresh

### System (for Cinema UI)
- `GET /api/system/status` - Get current system status
- `POST /api/system/power` - Set power state
- `POST /api/system/source` - Change video source
- `POST /api/system/audio/volume` - Set volume
- `POST /api/system/audio/mute` - Toggle mute
- `PUT /api/system/audio` - Update audio settings
- `GET /api/system/sources` - Get available sources

## Development Commands

```bash
# Install dependencies
npm install

# Build shared package (required before first run)
npm run build --workspace=packages/shared

# Development
npm run dev              # Run both apps
npm run dev:admin        # Run admin panel only
npm run dev:ui           # Run cinema UI only

# Build for production
npm run build            # Build all apps
npm run build:admin      # Build admin panel
npm run build:ui         # Build cinema UI

# Type checking
npm run type-check       # Check all workspaces
```

## Versioning & Releases

### Bump Version

Update version across all packages (root + workspaces):

```bash
# Patch version (1.0.0 → 1.0.1)
npm run version patch

# Minor version (1.0.0 → 1.1.0)
npm run version minor

# Major version (1.0.0 → 2.0.0)
npm run version major

# Specific version
npm run version 1.2.3
```

This will:
- Update all `package.json` files in sync
- Create a git commit
- Create a git tag (e.g., `v1.1.0`)

### Create Release

```bash
npm run release
```

This will:
1. Bump versions
2. Push commits and tags to GitHub
3. Trigger CI/CD pipeline

### CI/CD Pipeline

The project uses GitHub Actions for continuous integration and releases:

- **CI** (`ci.yml`) - Runs on every push/PR:
  - Type checking
  - Linting
  - Build verification

- **Release** (`release.yml`) - Runs on version tags:
  - Builds both apps
  - Creates `.tar.gz` archives
  - Generates SHA256 checksums
  - Creates GitHub release with changelog
  - Uploads artifacts

### Commit Message Format

Use conventional commits for automatic changelog generation:

```bash
feat: add mixer support to pipelines
fix: resolve CORS issue
docs: update README
chore: update dependencies
```

## Project Details

### Shared Package (`packages/shared`)

Contains:
- **Types** - TypeScript interfaces for Device, AudioSettings, VideoSource, etc.
- **API Client** - HTTP client with methods for all backend endpoints
- **React Hooks** - useDevices, useSystemStatus, useSetVolume, etc.

To make changes to the shared package:
1. Edit files in `packages/shared/src/`
2. Rebuild: `npm run build --workspace=packages/shared`
3. Restart the apps

### Network Access

Both apps are configured to expose on the network:
- Admin panel accessible from any device on your network
- Cinema UI designed for fullscreen browser on the cinema display

## Troubleshooting

### "Failed to resolve entry for package @open-cinema/shared"

**Solution:** Build the shared package first:
```bash
npm run build --workspace=packages/shared
```

### Import.meta.env TypeScript errors

The shared package doesn't use `import.meta.env` (Vite-specific). Apps should initialize the API client with their env variables if needed.

### Port already in use

Change ports in the respective `vite.config.ts` files:
- `apps/admin/vite.config.ts` - default: 3000
- `apps/ui/vite.config.ts` - default: 3001
