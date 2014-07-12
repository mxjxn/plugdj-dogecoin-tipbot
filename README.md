#DOGECOIN TIP BOT for PLUG.DJ

uses npm packages node-dogecoin, redis, plugapi and nconf.

you must have dogecoin running in the command line. I have only done this for linux. I installed dogecoin under another user for security purposes.

you must also have redis running. bot.js uses its default credentials. redis is used to keep tabs on which user has which id and which id belongs to which user.

by default, command delimiter is `.` (period)

###commands are...

`deposit` returns a wallet address you can deposit to

`withdraw [your-dogecoin-address]` sends your entire balance within the bot to your-dogecoin-address

`tip [@username] [value]` tips user the intended value (assuming you have it in that wallet)

`balance` displays your current balance in chat 

and a handful of other unimportant ones like `roll`, `throw`, `moo`, and `clap`. 

if you write a non-existent command, the bot will insult you. 
