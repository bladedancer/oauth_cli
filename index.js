const contentType = require('content-type');
const program = require('commander');
const express = require('express');
const opn = require('opn');
const process = require('process');
const qs = require('qs');
const request = require('request');

let siteAddress;
let clientId;
let clientSecret;

program.version('1.0.0')
    .arguments('<site-address> <client-id> <client-secret>')
    .action(((siteAddressArg, clientIdArg, clientSecretArg) => {
        siteAddress = siteAddressArg;
        clientId = clientIdArg;
        clientSecret = clientSecretArg;
    }))
    .parse(process.argv);

if (!siteAddress || !clientId || !clientSecret) {
    console.log(program.usage());
}

oauth();


function redirectHandler() {
    const app = express();
    const authPromise = new Promise((resolve, reject) => {
        app.get('/oauth', (req, res) => {
            if (!req.query.code) {
                res.send(400, 'No code');
                return reject('No code');
            }
            
            resolve(
                oauthCodeGrant(req.query.code).then((token) => {
                    res.send('Successfully redeemed token.')
                    return token;
                })
            );
        });
    });
    const server = app.listen(2280, () => console.log('Please complete OAuth in browser.'));
    return { server, authPromise };
}

function oauthCodeGrant(code) {
    const uri = `https://${siteAddress}.zendesk.com/oauth/tokens`;

    const body = {
        grant_type: 'authorization_code',
        code,
        client_id: clientId,
        redirect_uri: 'http://axway.localhost:2280/oauth',
        client_secret: clientSecret,
        scope: "read write"
    };

	const opts = {
		method: 'POST',
		uri,
		headers: {
			'content-type': 'application/x-www-form-urlencoded'
		},
		body: qs.stringify(body)
    };

    return new Promise((resolve, reject) => {
		request(opts,
			(err, response) => {
				if (err) {
					return reject(err);
                } 
                else if (response.statusCode !== 200) {
					return reject(response.body || `${response.statusCode}${response.statusMessage ? ' ' + response.statusMessage : ''}`);
				}

				const respContentType = contentType.parse(response.headers['content-type']);
				if (respContentType.type !== 'application/json') {
					return reject(`Unsupported mime-type: ${response.headers['content-type']}`);
				}
				const respObj = JSON.parse(response.body);
				resolve(respObj);
			}
		).on('error', (err) => reject(err));
	});
}

async function oauth() {
    const redirectUrl = 'http://axway.localhost:2280/oauth';
    const url = `https://${siteAddress}.zendesk.com/oauth/authorizations/new?response_type=code&redirect_uri=${redirectUrl}&client_id=${clientId}&scope=read%20write`;

    const { server, authPromise } = redirectHandler(siteAddress);
    const browser = await opn(url);
    browser.on('close', () => {
        server.close();
    });

    try {
        const token = await authPromise;
        console.log(token);
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

