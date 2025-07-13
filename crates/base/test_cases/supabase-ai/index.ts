const session = new Supabase.ai.Session('gte-small');

export default {
    async fetch() {
        try {
            // Generate embedding
            const embedding = await session.run("meow", {
                mean_pool: true,
                normalize: true
            });

            if (embedding instanceof Array) {
                return new Response(JSON.stringify({ success: true, embedding }), {
                    status: 200,
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });
            } else {
                return new Response(JSON.stringify({ success: false, error: 'Invalid embedding result' }), {
                    status: 500,
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });
            }
        } catch (error) {
            return new Response(JSON.stringify({ success: false, error: error.message }), {
                status: 500,
                headers: {
                    'Content-Type': 'application/json'
                }
            });
        }
    }
}