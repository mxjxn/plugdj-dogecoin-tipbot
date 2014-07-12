var roll = function(dieType){
    var num=0;
    if( dieType == "" || dieType == "d6")
        num = Math.floor(Math.random() * 6) + 1;
    else if(dieType == "d20")
        num = Math.floor(Math.random() * 20) + 1;
    else{
        return 'format is !roll or !roll d20';
    }
        
    return ("you rolled a " + num);
}

var rockPaperScissors = function(whatYouThrew){
    if(whatYouThrew != "rock" && whatYouThrew !="paper" && whatYouThrew !="scissors") {
        return ('throw rock, paper or scissors. Thats how the game works.');
    }
    var botThrow = Math.floor(Math.random() * 3), // 0-rock,1-paper,2-scissors
    throwValue = ['rock','paper','scissors'],
    usrThrow = (whatYouThrew=="rock")?0:
               (whatYouThrew=="paper")?1:
               (whatYouThrew=="scissors")?2:null;

    if(botThrow==usrThrow){
        return('both threw '+whatYouThrew+' - tie!');
    }
    else if((botThrow==0 && usrThrow == 2) || botThrow -1 == usrThrow)
        return('bot won with ' + throwValue[botThrow]);
    else if(usrThrow -1 == botThrow || (botThrow == 2 && usrThrow == 0))
        return('bot threw ' + throwValue[botThrow] + '. you win!');
}
module.exports.roll = roll;
module.exports.rockPaperScissors = rockPaperScissors;
