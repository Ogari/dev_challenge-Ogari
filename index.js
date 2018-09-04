var fs = require('fs');
var csv = require('fast-csv');
var originalCSVArray = [];

fs.createReadStream('input.csv')
  .pipe(csv())
  .on('data', function(data){
      originalCSVArray.push(data);

  })
  .on('end', function(data){
      console.log('Read finished');
    var jsonArr = [];

     var indexes = [];
     // First line of CSV -> Headers
     indexes = classesIndex(originalCSVArray[0]);
     mergeClasses(originalCSVArray,indexes);
     jsonArr = prepArr(originalCSVArray);

     // Get address references (tags and types)
     var refAddr = [];
     refAddr = filterAddresses(originalCSVArray);

     // Append remaining values
     appendAddrBool(refAddr, originalCSVArray, jsonArr);

     // Filter values
     refinedFilter(jsonArr);

    // Merges duplicate columns
     mergeDuplicates(jsonArr);

     // Writes file
     fs.writeFile("./output.json", JSON.stringify(jsonArr, null, 4), (err) => {
        if (err) {
            console.error(err);
            return;
        };
        console.log("File has been created");
    });
  });

  // Find all 'class' column indexes
  function classesIndex(array){
    var indexes = [];
    for (var i = 0; i < array.length; i++){
        if (array[i] == "class"){
            indexes.push(i);
        }
    }
    return indexes;
  }

    // Merge all 'class' column entries
    // MUST REMEMBER TO TRANSFORM INTO ARRAY LATER, BY SPLITTING COMMAS {.split(",")}
  function mergeClasses(arrayToConvert, indexArr){
    let pos = indexArr[0]; // new position for column 'classes'
    // arrayToConvert[0][pos] = "classes"; // new name in header
    arrayToConvert[0].splice(pos, 0, "classes");// new name in header
    
    if (indexArr.length > 1){
        for (var i = 1; i < indexArr.length; i++){
            for (var j = 0; j < arrayToConvert.length; j++){
                nextEntry = indexArr[i];

                if (j == 0){
                arrayToConvert[j].splice(nextEntry, 1);
                }
                arrayToConvert[j][pos] += ", "  + arrayToConvert[j][nextEntry];
                arrayToConvert[j].splice(nextEntry, 1);
            }
        }
    }
  }

  function filterAddresses(arrayToFilter){
    // Getting tags
    var address = [];
    for (var i = 0; i < arrayToFilter[0].length; i++){
        header = arrayToFilter[0][i];
        if(header.indexOf("phone") !== -1){
            var str = header.replace("phone", "");
            var arr = str.split(",");
            var addr = {type:"phone", tags:arr};
            address.push(addr);
        }
        else if(header.indexOf("email") !== -1){
            var str = header.replace("email", "");
            var arr = str.split(",");
            var addr = {type:"email", tags:arr};
            address.push(addr);
        }
        else {
            address.push(null);
        }
    }
    return address;
  }

  function prepArr(arrayToPrep){
      // Initialize matrix
    var prepMat = [];
    for (var i = 0; i < arrayToPrep.length; i++) {
        prepMat.push([0])
        for (var j = 0; j < 3; j++) {
            prepMat[i][j] = null;
        }
    }

    for (var i = 0; i < arrayToPrep[0].length; i++){
        if(arrayToPrep[0][i] == "fullname"){
            for (var j = 1; j < arrayToPrep.length; j++){ //ignore header
                prepMat[j][0] = arrayToPrep[j][i];
            }
        }
        if(arrayToPrep[0][i] == "eid"){
            for (var j = 1; j < arrayToPrep.length; j++){ //ignore header
                prepMat[j][1] = arrayToPrep[j][i];
            }
        }
        if(arrayToPrep[0][i].indexOf("classes") !== -1){
            for (var j = 1; j < arrayToPrep.length; j++){ //ignore header
                var arr =  arrayToPrep[j][i].split(",");
                prepMat[j][2] = arr;
            }
        }
    }
    var objArr = [];
    for (var i = 1; i < arrayToPrep.length; i++){
        objArr.push(
            {fullname:prepMat[i][0], 
                eid:prepMat[i][1], 
                classes:prepMat[i][2], 
                addresses:[], 
                invisible:false, 
                see_all:false}
        );
    }
    return objArr;
  }

  // Add addresses to each
  function appendAddrBool(refAddr, csvArr, objArr){
    for (var i = 0; i < refAddr.length; i++){
        if (refAddr[i] != null){ // Checks with reference where there are addresses
            for (var j = 1; j < csvArr.length; j++){
                if (csvArr[j][i] != ""){
                    var addrObj = {type:refAddr[i].type, tags:refAddr[i].tags, address:csvArr[j][i] };
                    objArr[j - 1].addresses.push(addrObj);
                }
            }
        }
        // In this case, tries to find the booleans and pass the values
        if(csvArr[0][i] == "invisible"){
            for (var j = 1; j < csvArr.length; j++){
                if (csvArr[j][i] == 1){
                    objArr[j - 1].invisible = true;
                }
            }
        }
        if(csvArr[0][i] == "see_all"){
            for (var j = 1; j < csvArr.length; j++){
                if (csvArr[j][i] == "yes"){
                    objArr[j - 1].see_all = true;
                }
            }
        }
    }
  }

  function refinedFilter(jsonArr){
    const phoneUtil = require('google-libphonenumber').PhoneNumberUtil.getInstance();
    const PNF = require('google-libphonenumber').PhoneNumberFormat;

    for (var i = 0; i < jsonArr.length; i++){
        // Check classes separated by '/' and deletes empty strings
        var arr = [];
       for (var j = 0; j < jsonArr[i].classes.length; j++){
        if(jsonArr[i].classes[j].replace(/\s/g, '').length == 0){ // Checks if only whitespace
            jsonArr[i].classes.splice(j, 1); // Deletes
            j = j -1;
        } else{
            arr.push(jsonArr[i].classes[j].split("/"));
            }
       } 
       var merged = [].concat.apply([], arr);
       jsonArr[i].classes = merged;

       for (var j = 0; j < jsonArr[i].addresses.length; j++){
           // Checks and validates emails
        if(jsonArr[i].addresses[j].type == "email"){
            var emailsArray = jsonArr[i].addresses[j].address.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/gi);
            if (emailsArray != null && emailsArray.length) {
                //Gets email(s)
                if(emailsArray.length > 1){
                    var arrEmails = [];
                    for (var a = 0; a < emailsArray.length; a++){
                        arrEmails.push({type:"email", 
                        tags:jsonArr[i].addresses[j].tags, 
                        address:emailsArray[a]});
                        }
                         jsonArr[i].addresses.splice(j, 1);
                         jsonArr[i].addresses.push(arrEmails); // <- MUDAR PRA MANTER LOCAL CERTO (?)
                        // Merge all email address objects
                        var mergedEmails = [].concat.apply([], jsonArr[i].addresses);
                        jsonArr[i].addresses = mergedEmails;
                    } else { // Check for impurities
                        if (jsonArr[i].addresses[j].address != emailsArray[0]){
                            jsonArr[i].addresses.splice(j, 1);
                        }
                    }
                } else { // No suitable email string was found
                    jsonArr[i].addresses.splice(j, 1);
                }

        }
        if(jsonArr[i].addresses[j].type == "phone"){ 
            var boolean = false;
            try {
                phoneUtil.parse(jsonArr[i].addresses[j].address, 'BR');
                boolean = true;
            }
            catch(err) {
                console.log("not Number");
                jsonArr[i].addresses.splice(j, 1); // Deletes the number
                j = j -1; // Reposition array, due to splice cutting off one element
                boolean = false;
            }
            if (boolean){                
                let number = phoneUtil.parse(jsonArr[i].addresses[j].address, 'BR');
                // Check if it is not a valid number
                if(!phoneUtil.isValidNumber(number)){
                    jsonArr[i].addresses.splice(j, 1); // Deletes the number
                    j = j -1; // Reposition array, due to splice cutting off one element
                } else {
                    var str = phoneUtil.format(number, PNF.INTERNATIONAL);
                    str = str.replace(/\D/g,'');
                    jsonArr[i].addresses[j].address = str;
                }
            }
        }

       } 
    }
    
    mergeAddrTags(jsonArr);
  }

  function mergeAddrTags(jsonArr){
    for (var i = 0; i < jsonArr.length; i++){
        for (var j = 0; j < jsonArr[i].addresses.length; j++){
            var lastPos = jsonArr[i].addresses.map(obj => obj.address).lastIndexOf(jsonArr[i].addresses[j].address);
            if(lastPos != j){
                // Merge tags
                jsonArr[i].addresses[lastPos].tags = jsonArr[i].addresses[j].tags.concat(
                    jsonArr[i].addresses[lastPos].tags.filter(function (item) {
                    return jsonArr[i].addresses[j].tags.indexOf(item) < 0;
                     }));
                jsonArr[i].addresses.splice(j, 1);
                j = j-1;
            }
        }
    }
  }

  function mergeDuplicates(jsonObj){
    for (var i = 0; i < jsonObj.length; i++){
        // Checks for a duplicate "eid"
        var lastPos = jsonObj.map(obj => obj.eid).lastIndexOf(jsonObj[i].eid);
        if(lastPos != i){
            if(jsonObj[i].fullname == jsonObj[lastPos].fullname){ // Same person, for sure
                // Merge occurence into last case
                // Classes
                jsonObj[lastPos].classes = jsonObj[i].classes.concat(
                    jsonObj[lastPos].classes.filter(function (item) {
                    return jsonObj[i].classes.indexOf(item) < 0;
                     }));

                // Addresses
                jsonObj[lastPos].addresses = jsonObj[i].addresses.concat(
                    jsonObj[lastPos].addresses.filter(function (item) {
                    return jsonObj[i].addresses.indexOf(item) < 0;
                     }));
                
                // Booleans     
                if(jsonObj[i].invisible == true){
                    jsonObj[lastPos].invisible = true;
                }
                if(jsonObj[i].see_all == true){
                    jsonObj[lastPos].see_all = true;
                }
                jsonObj.splice(i, 1); // To maintain only last occurence
            }
        }
    }
}
