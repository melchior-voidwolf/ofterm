import { v4 as uuidv4 } from 'uuid'

// uuid's browser implementation falls back to crypto.getRandomValues when
// crypto.randomUUID is unavailable (plain HTTP LAN, non-secure context).
export function randomId(): string {
  return uuidv4()
}
