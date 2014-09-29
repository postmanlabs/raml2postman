A RAML to POSTMan converter.

Usage examples:
    Read spec.raml and store the output in output.json after grouping the requests into folders
        ./raml2postman -s spec.raml -o output.json -g

    Read spec.raml and print the output to the console
        ./raml2postman -s spec.raml

	Read spec.raml and print the prettified output to the console
        ./raml2postman -s spec.raml -p
