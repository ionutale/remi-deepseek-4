import { connectDB } from '$lib/server/db';

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
