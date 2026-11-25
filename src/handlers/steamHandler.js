const axios = require('axios');
const cheerio = require('cheerio');

async function getSteamGameInfo(query, signal) {
    try {
        console.log(`[STEAM] Buscando jogo: ${query}`);
        const searchRes = await axios.get(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(query)}&l=brazilian&cc=BR`, { timeout: 8000, signal });
        
        if (!searchRes.data || !searchRes.data.items || searchRes.data.items.length === 0) {
            return { error: `Não encontrei nenhum jogo com o nome "${query}" na Steam.` };
        }
        
        const game = searchRes.data.items[0]; 
        const appId = game.id;
        
        const detailsRes = await axios.get(`https://store.steampowered.com/api/appdetails?appids=${appId}&l=brazilian&cc=BR`, { timeout: 8000, signal });
        
        if (!detailsRes.data || !detailsRes.data[appId] || !detailsRes.data[appId].success) {
             return { error: `Encontrei o jogo na busca, mas não consegui puxar os detalhes do AppID ${appId}.` };
        }
        
        const data = detailsRes.data[appId].data;
        
        let desc = data.short_description || "";
        if (desc.includes('<')) {
            const $ = cheerio.load(desc);
            desc = $.text();
        }

        const price = data.price_overview ? data.price_overview.final_formatted : (data.is_free ? 'Gratuito' : 'Preço não disponível');
        const originalPrice = data.price_overview && data.price_overview.initial > data.price_overview.final ? data.price_overview.initial_formatted : null;
        const discount = data.price_overview ? data.price_overview.discount_percent : 0;
        
        return {
            success: true,
            name: data.name,
            appId: appId,
            price: price,
            priceValue: Number.isInteger(data.price_overview?.final) ? data.price_overview.final / 100 : data.is_free ? 0 : null,
            priceCurrency: data.price_overview?.currency || (data.is_free ? 'BRL' : null),
            originalPrice: originalPrice,
            discount: discount,
            description: desc,
            url: `https://store.steampowered.com/app/${appId}/`,
            headerImage: data.header_image,
            developers: data.developers ? data.developers.join(', ') : 'Desconhecido',
            publishers: data.publishers ? data.publishers.join(', ') : 'Desconhecido',
            releaseDate: data.release_date && data.release_date.date ? data.release_date.date : 'Desconhecida',
            metacritic: data.metacritic ? data.metacritic.score : null
        };
        
    } catch (error) {
        signal?.throwIfAborted();
        console.error('[STEAM] Erro na API:', error.message);
        return { error: 'Não consegui consultar a Steam. Tente novamente em instantes.' };
    }
}

module.exports = {
    getSteamGameInfo
};
