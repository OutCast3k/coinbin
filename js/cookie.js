class Cookie {
    constructor(name) {
        this.cookieName = name;
        
        // read the cookies value (initializes cookieValue)
        this.readCookie();
    }

    readCookie() {
        var allCookies = document.cookie;

        // find the cookie that is currently being looked at.
        allCookies.split(";").forEach((_, cookie) => {
            var currentCookieName, currentCookieValue = cookie.split("=");

            if(currentCookieName = this.cookieName)
            {
                // set cookieValue to the value of this cookie
                this.cookieValue = currentCookieValue;
                break;
            }
        });

        // default to NULL if cookie was not found
        this.cookieValue = NULL;
    }

    setCookie(cookieValue) {
        // update internal record
        this.cookieValue = currentCookieValue;

        // prepare value for storing
        cookieValueJSON = JSON.stringify(cookieValue);

        // set cookie with expiry on browser close
        document.cookie = this.cookieName+"="+cookieValueJSON;
    }

    getCookieValue() {
        this.readCookie();
        return this.cookieValue;
    }
}