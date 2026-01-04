Check your account information.
The returned data will show your email and balance.
Endpoint	https://otpcepat.org/api/handler_api.php?api_key=$api_key&action=getBalance
Method	GET
Parameter:
api_key	2ded6ac597a8469c8303e3c7f24a7a1b
action	getBalance
Response:
Success	{"status":"true","data":{"email":"youremail@host.com","saldo":"9999999999"}}
Failed	
{"status":"false","msg":"You don't have Access!"}
{"status":"false","msg":"BAD ACTION"}

API KEY saved in env with API_KEY_OTPCEPAT="key"

Get all countries
The returned data will show all. that available to order.
Endpoint	https://otpcepat.org/api/handler_api.php?api_key=$api_key&action=getCountries
Method	GET
Parameter:
api_key	2ded6ac597a8469c8303e3c7f24a7a1b
action	getCountries
Response:
Success	{"status":"true","countryID":country_id,"data":[{"countryID":"0","countryName":"Russia"},{"countryID":"1","countryName":"Ukraine"}]}
Failed	
{"status":"false","msg":"You don't have Access!"}
{"status":"false","msg":"BAD ACTION"}

Get all operators.
The returned data will show all operators that available to order, also it will show opertor name.
Endpoint	https://otpcepat.org/api/handler_api.php?api_key=$api_key&action=getOperators&country_id=$country_id
Method	GET
Parameter:
api_key	2ded6ac597a8469c8303e3c7f24a7a1b
action	getOperators
country_id	country_id from Get Countries
Response:
Success	{"status":"true","countryID":country_id,"data":["random","operatorName"]}}
Failed	
{"status":"false","msg":"You don't have Access!"}
{"status":"false","msg":"BAD ACTION"}
{"status":"false","msg":"WRONG COUNTRY ID"}

Get all service and price.
The returned data will show all service that available to order, also it will show id and price of each service.
Endpoint	https://otpcepat.org/api/handler_api.php?api_key=$api_key&action=getServices&country_id=$country_id
Method	GET
Parameter:
api_key	2ded6ac597a8469c8303e3c7f24a7a1b
action	getServices
country_id	country_id from Get Countries
Response:
Success	{"status":"true","countryID":country_id,"data":[{"serviceID":"1","serviceName":"Flip","price":"99"},{"serviceID":"2","serviceName":"Gmail\/Youtube","price":"99"}]}
Failed	
{"status":"false","msg":"You don't have Access!"}
{"status":"false","msg":"BAD ACTION"}
{"status":"false","msg":"WRONG COUNTRY ID"}

Get all special service and price.
The returned data will show all special service that available to order, also it will show id and price of each service.
Endpoint	https://otpcepat.org/api/handler_api.php?api_key=$api_key&action=getSpecialServices
Method	GET
Parameter:
api_key	2ded6ac597a8469c8303e3c7f24a7a1b
action	getSpecialServices
Response:
Success	{"status":"true",data":[{"serviceID":"1","serviceName":"Flip","price":"99"},{"serviceID":"2","serviceName":"Gmail\/Youtube","price":"99"}]}
Failed	
{"status":"false","msg":"You don't have Access!"}
{"status":"false","msg":"BAD ACTION"}

Make a new order.
The returned data will show you the Order ID, Phone Number and the Status of the order.
Endpoint	https://otpcepat.org/api/handler_api.php?api_key=$api_key&action=get_order&operator_id=$operator_id&service_id=$service_id&country_id=$country_id
Method	GET
Parameter:
api_key	2ded6ac597a8469c8303e3c7f24a7a1b
action	get_order
operator_id	operator_id from Get Operators
service_id	service_id from Get Service List
country_id	country_id from Get Countries
Response:
Success	{"status":true,"data":{"order_id":"fbe71d05c3***779df1272c8e7","number":"xxxxxxxxxxxxxx","price":99,"status":"Waiting SMS"}}
Failed	
{"status":"false","msg":"You don't have Access!"}
{"status":"false","msg":"BAD ACTION"}
{"status":"false","msg":"NO BALANCE"}
{"status":"false","msg":"INVALID OPERATOR"}
{"status":"false","msg":"INVALID SERVICE ID"}
{"status":"false","msg":"WRONG SERVICE ID"}
{"status":"false","msg":"WRONG OPERATOR ID"}
{"status":"false","msg":"WRONG COUNTRY ID"}

Check your the order status.
The data returned will show the status of the requested order id.
Endpoint	https://otpcepat.org/api/handler_api.php?api_key=$api_key&action=get_status&order_id=$order_id
Method	GET
Parameter:
api_key	2ded6ac597a8469c8303e3c7f24a7a1b
action	get_status
order_id	fbe71d05c3***779df1272c8e7
Response:
Success	{"status":"true","data":{"order_id":"fbe71d05c3***779df1272c8e7","number":"xxxxxxxxxxxxxx","serviceName":"Yahoo","status":"Waiting SMS","sms":"text_sms"}}
Status	
Waiting SMS
Recieved
Cancel
Done
Failed	
{"status":"false","msg":"You don't have Access!"}
{"status":"false","msg":"BAD ACTION"}
{"status":"false","msg":"INVALID ORDER ID"}
{"status":"false","msg":"WRONG ORDER ID"}

Update/Change the order status.
You can update the status of your order to Order new free sms, Cancel it, or Finish the order.
Endpoint	https://otpcepat.org/api/handler_api.php?api_key=$api_key&action=set_status&order_id=$order_id&status=$status
Method	GET
Parameter:
api_key	2ded6ac597a8469c8303e3c7f24a7a1b
action	set_status
order_id	fbe71d05c3***779df1272c8e7
status	
2 (Cancel)
3 (Resend SMS)
4 (Finish)
Response:
Success	{"status":true,"msg":"success"}
Failed	
{"status":"false","msg":"You don't have Access!"}
{"status":"false","msg":"BAD ACTION"}
{"status":"false","msg":"WRONG ORDER ID"}
{"status":"false","msg":"WRONG STATUS"}
{"status":"false","msg":"INVALID ORDER ID"}
{"status":"false","msg":"INVALID STATUS"}