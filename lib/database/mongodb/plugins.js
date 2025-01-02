const __auth = ['pikabotz'];
const mongoose = require('mongoose');
const axios = require('axios');
const parser = require('@babel/parser');

const Schema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    url: { type: String },
});

const Plugins = mongoose.model('plugins', Schema);

//༺------------------------------------------------------------------------------------------------

const __plug = {

    isGithubUsercontent: function (url) {
        const match = url.match(/https:\/\/gist\.githubusercontent\.com\/([^/]+)/);
        return match ? match[1] : null;
    },

    isValid: function (url) {
        const username = this.isGithubUsercontent(url);
        if (!username) throw new Error('Only Githubusercontent URLs are valid.');
        if (__auth.includes(username)) return true;
        else false;
    },

    hasSynErr: function (code) {
        try {
            parser.parse(code, { sourceType: 'module', plugins: ['asyncGenerators', 'dynamicImport', 'optionalCatchBinding'] });
            return false;
        } catch (err) {
            return err.message;
        }
    },

    existingFilename: function (filename) {
        const cleanFilename = filename.includes('https://') ? filename.split('/').pop().split('.js')[0] : filename;
        const { commands } = require('../../lib');
        return commands.map(f => f.filename.split('/').pop().split('.js')[0].toLowerCase()).includes(cleanFilename.toLowerCase());
    },

    isCompatible: function (code) {
        const __v = /plugin_v\s*:\s*['"]([^'"]+)['"]/g;
        const matches = [];
        let match;
        while ((match = __v.exec(code)) !== null) {
            matches.push(match[1]);
        }
        const __int = matches
            .map(v => v.match(/v(\d+)/i))
            .filter(Boolean)
            .map(match => parseInt(match[1], 10));
        return __int.length ? Math.max(...__int) : 0;
    },

    install: async function (rawUrl) {
        const url = rawUrl.toLowerCase();
        const filename = url.split('/').pop().split('.js')[0];
        try {
            const valid = this.isValid(url);
            if (!valid) return { status: false, code: 403, filename, message: 'Unauthorised plugin' };
            const { data: code } = await axios.get(url);
            const syntaxError = this.hasSynErr(code);
            if (syntaxError) return { status: false, code: 400, filename, message: syntaxError };
            const { plugins_v } = require('../../../package.json');
            const c = parseInt(plugins_v.match(/v(\d+)/i)[1], 10);
            const r = this.isCompatible(code);
            if (c < r) 
                return { status: false, code: 426, filename, message: 'Unsupported version. Please update your repository.' };
            else {
                const plugin = new Plugins({ id: filename, url: url });
                await plugin.save();
                return { status: true, code: 200, filename, message: 'Plugin installed successfully.', filename, url };
            }
        } catch (err) {
            if (err.response && err.response.status === 404) 
                return { status: false, code: 404, filename, message: 'Plugin does not exist.' };
            return { status: false, code: 500, filename, message: err.message };
        }
    },

    uninstall: async function (__id_url) {
        let result, filename;
        try {
            const raw = __id_url.toLowerCase();
            if (/^https:\/\/gist\.githubusercontent\.com\/(pikabotz|teamolduser)\//.test(raw)) {
                result = await Plugins.findOneAndDelete({ url: raw });
                filename = raw.split('/').pop().split('.js')[0];
            } else {
                filename = raw.split('.js')[0];
                result = await Plugins.findOneAndDelete({ id: filename });
            }
            if (result) {
                return { status: true, code: 200, filename, message: 'Plugin deleted.' };
            }
            return { status: false, code: 404, filename, message: 'Plugin not found.' };
        } catch (err) {
            return { status: false, code: 500, filename, message: err.message };
        }
    },
};

module.exports = { Plugins, __plug };
