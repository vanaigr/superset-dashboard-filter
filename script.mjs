// @ts-check
import { JSDOM } from 'jsdom'
import fetch from 'node-fetch';

function getSessionCookie(resp) {
    const cookies = resp.headers.raw()['set-cookie']
    if(!cookies) return undefined
    for(let i = 0; i < cookies.length; i++) {
        const c = cookies[i]
        const nameEnd = c.indexOf('=')
        if(nameEnd === -1) {
            console.warn('Invalid cookie: ' + c)
            continue
        }
        const name = c.substring(0, nameEnd)
        if(name !== 'session') continue

        let valueEnd = c.indexOf(';')
        if(valueEnd === -1) valueEnd = c.length

        return c.substring(nameEnd + 1, valueEnd)
    }
}

const base = new URL('http://localhost:8089')

function getCsrfTokenFromHtml(html) {
    const dom = new JSDOM(html)
    const doc = dom.window.document

    /**@type{string | undefined}*/
    let csrfToken

    const tokenEl = /**@type{HTMLInputElement | undefined}*/(doc.getElementById('csrf_token'))
    csrfToken = tokenEl?.value

    /*TODO
    if(!csrfToken) {
        const bootstrapStr = doc.getElementById('app')?.getAttribute('data-bootsrtap')
        if(bootstrapStr) {
            const bootstrap = JSON.parse(bootstrapStr)
            const cookieName = bootstrap.common.conf.JWT_ACCESS_CSRF_COOKIE_NAME
        }
    } */

    if(!csrfToken) {
        throw new Error('No csrf token found')
    }

    return csrfToken
}

async function getCsrfTokenNotAuthenticated(headers) {
    const resp = await fetch(base, {
        method: 'GET',
        headers: {
            accept: 'text/html',
            ...headers,
        },
    })

    return [getCsrfTokenFromHtml(await resp.text()), resp]
}

if(false) {
async function getCsrfTokenAuthenticated() {
    const resp = await fetch(new URL('api/v1/security/csrf_token', base), {
        method: 'GET',
        headers: {
            accept: 'application/json',
        },
    })
    if(!resp.ok) throw new Error(
        'CSRF token response status: '
            + resp.status
            + await resp.text().then(
                it => '\nBody: ' + it,
                e => 'Body error: ' + e,
            )
    )
    const res = /**@type{any}*/(await resp.json())
    return /**@type{string}*/(res.result)
}
}

//let [token, tokenResp] = await getCsrfTokenNotAuthenticated()
//let sessionCookie = getSessionCookie(tokenResp)
//if(sessionCookie == null) throw new Error('No session cookie')

if(false) {
const loginPageResp = await fetch(new URL('login/', base), {
    method: 'GET',
    "headers": {
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        "accept-language": "en-US,en;q=0.9,ru;q=0.8",
        "cache-control": "max-age=0",
        "sec-ch-ua": "\"Microsoft Edge\";v=\"135\", \"Not-A.Brand\";v=\"8\", \"Chromium\";v=\"135\"",
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": "\"Windows\"",
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "same-origin",
        "sec-fetch-user": "?1",
        "upgrade-insecure-requests": "1",
        "Referer": "http://localhost:8089/superset/welcome/",
        "Referrer-Policy": "strict-origin-when-cross-origin"
    },
})
let token = getCsrfTokenFromHtml(await loginPageResp.text())
let sessionCookie = getSessionCookie(loginPageResp)
}

const authResp = await fetch(new URL('api/v1/security/login', base), {
    method: 'POST',
    headers: {
        'content-type': 'application/json',
    },
    body: JSON.stringify({
        username: 'admin',
        password: 'admin',
        provider: 'db',
        refresh: true,
    }),
})
const authorization = (await authResp.json()).access_token

const csrfResp = await fetch(new URL('/api/v1/security/csrf_token/', base), {
    method: 'GET',
    headers: {
        'content-type': 'application/json',
        'authorization': 'Bearer ' + authorization,
    },
})
const csrf = (await csrfResp.json()).result
const sessionCookie = getSessionCookie(csrfResp) // Programmatic clients famously use cookies...

const uploadResp = await fetch(
    new URL('api/v1/dashboard/' + encodeURIComponent('11') + '/filter_state', base),
    {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-csrftoken': csrf,
            'authorization': 'Bearer ' + authorization,
            cookie: 'session=' + sessionCookie, // Required :/
        },
        body: JSON.stringify({ value: JSON.stringify('<filters>') })
    }
)

if(!uploadResp.ok) throw new Error('Status code: ' + uploadResp.status + '\nMessage: ' + await uploadResp.text())
const uploadRes = await uploadResp.json()
console.log(uploadRes)


if(false) {
    await fetch(new URL('login/', base), {
    method: 'POST',
    headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'x-csrftoken': token,
        cookie: 'session=' + sessionCookie,

        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        "accept-language": "en-US,en;q=0.9,ru;q=0.8",
        "cache-control": "max-age=0",
        "sec-ch-ua": "\"Microsoft Edge\";v=\"135\", \"Not-A.Brand\";v=\"8\", \"Chromium\";v=\"135\"",
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": "\"Windows\"",
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "same-origin",
        "sec-fetch-user": "?1",
        "upgrade-insecure-requests": "1",
        "Referer": "http://localhost:8089/login/?next=http://localhost:8089/superset/welcome/",
        "Referrer-Policy": "strict-origin-when-cross-origin"
    },
    body: 'csrf_token=' + encodeURIComponent(token)
        + '&username=' + encodeURIComponent('admin')
        + '&password=' + encodeURIComponent('admin')
})
if(!loginResp.ok) throw new Error('Login response status: ' + loginResp.status)
sessionCookie = getSessionCookie(loginResp) || sessionCookie
//token = getCsrfTokenFromHtml(await loginResp.text())
console.log(await loginResp.text(), loginResp.status)

//;[token, tokenResp] = await getCsrfTokenNotAuthenticated({ cookie: 'session=' + sessionCookie, 'x-csrftoken': token })
//sessionCookie = getSessionCookie(tokenResp) || sessionCookie

const uploadResp = await fetch(
    new URL('api/v1/dashboard/' + encodeURIComponent('11') + '/filter_state', base),
    {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-csrftoken': token,
            cookie: 'session=' + sessionCookie,
            /*
            'x-csrftoken': 'IjExZmJkN2ViZDgwYWJkYjIyZjJhMTdiOTk4MzljZTA0MGI3ZTllZGYi.aA7f1g.x8HhLOwsZjzuAR7RdF1jKJ2EG_4',
            cookie: 'session=.eJwljt1qwzAMRt_F14VY8q_yKqME2ZKXsNKUxL0YY-8-t7sRSPqOdH7M0g49VzP346kXs2xiZsMSfVLgWrFR81zRqiZBW1hSCS4wcwoAIjVELYkUVVqs4Chx5RF2KhmFchBw3jGiJmQlqlA1IxICpOIIgsccC7ToUk5jSeCdRjNEnqce_zYw2noeben7l95fA2hFkhbJlosUxIY8zhFlR1WttyUpDaHB3fbKNx3MAC_mwZ-6rNvZ9-PbzB9m7f0xT9M7tO5nn7PNeXp9Pt91u7d9MtffPxRVWTA.Z_6MeA.9sE5c4SOahO4ral1HeECcJ8IEUU',
            */
        },
        body: JSON.stringify({ value: JSON.stringify('<filters aboba>') })
    }
)

if(!uploadResp.ok) throw new Error('Status code: ' + uploadResp.status + '\nMessage: ' + await uploadResp.text())
const uploadRes = await uploadResp.json()
console.log(uploadRes)
}
