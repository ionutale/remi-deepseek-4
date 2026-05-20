import { connectDB, disconnectDB } from '$lib/server/db';

let connected = false;

export async function handle({ event, resolve }) {
	if (!connected) {
		try {
			await connectDB();
			connected = true;
		} catch (e) {
			console.warn('MongoDB connection failed — using in-memory storage:', e);
		}
	}
	return resolve(event);
}

process.on('SIGTERM', async () => {
	await disconnectDB();
	process.exit(0);
});

process.on('SIGINT', async () => {
	await disconnectDB();
	process.exit(0);
});
