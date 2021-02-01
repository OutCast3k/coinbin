class Cookie {
    #name;
    #value;

    constructor(name) {
        this.name = name;
        this.value;

        // read the cookies value (initializes value)
        this.get();
    }

    get() {
        var allCookies = document.cookie;
        var cookie;

        // find out how much cookies are set to be able to pick the right one
        if(!allCookies)
        {
            // the tray is empty. leave fields as initialized
            return;
        }

        if(allCookies.indexOf(";") > 0)
        {
            // many cookies found, pick one
            cookie = this.pickCookie(allCookies);
        } else {
            // only one cookie found. Check if its the right one
            if(this.validateCookie(allCookies))
            {
                cookie = allCookies;
            }
        }

        // read contents of the picked cookie
        if(cookie) {
            this.value = this.readCookieContents(cookie);
        } else {
            console.log("Coudn't get cookie");
        }
    }

    pickCookie(manyCookies) {
        manyCookies.split(";").forEach((cookie, _) => {
            if(this.validateCookie(cookie))
            {
                return cookie;
            }
        });
    }

    validateCookie(cookie) {
        if(cookie.indexOf("=") >= 0)
        {
            var cookieCredentials = cookie.split("=");
            var name = cookieCredentials[0]
            return name == this.name;
        } else {
            return false;
        }
    }

    readCookieContents(cookie) {
        var cookieCredentials = cookie.split("=");
        var value = cookieCredentials[1];
        return JSON.parse(value);
    }

    setValue(valueToBeSet) {
        // update internal record
        this.value = valueToBeSet;

        // prepare value for storing
        var valueJSON = JSON.stringify(valueToBeSet);

        // set cookie with expiry on browser close
        document.cookie = this.name+"="+valueJSON;
    }

    getValue() {
        this.get();
        return this.value;
    }
}