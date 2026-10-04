// The app as it ships, started after the demo week is in the local copy.
import { seedDemo } from './seed'

await seedDemo()
await import('../../src/main.tsx')
