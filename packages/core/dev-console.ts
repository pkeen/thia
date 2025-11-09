// dev_console.ts
import { User } from "./src/domain/entities";

(globalThis as any).User = User;

console.log("Domain loaded. Try: new User('id-1', 'pete@example.com')");
