# castDog

CastDog is a chromeCast watchdog. It watches the configured chromecasts for changes in the running application. When found that the backdrop is running, it casts the predefined application.

This keeps a standard application running, but also allows you to cast your own content. When you stop casting, CastDog takes over and reinitializes the default application.

to start create a `config.json` file like this:

    {
        "chromecast name": {
            "url":"http://www.example.com/",
            "rotation": 0,
            "zoom": 1,
            "aspect": "native",
            "overscan": [0,0,0,0]
        }
    }