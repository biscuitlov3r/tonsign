let image = null;

$("#image").change(() => {
    //on change event
    formdata = new FormData();
    if ($("#image").prop("files").length > 0) {
        file = $("#image").prop("files")[0];
        formdata.append("filedata", file);

        jQuery.ajax({
            url: "/upload",
            type: "POST",
            data: formdata,
            processData: false,
            contentType: false,
            success: function (result) {
                if (result.status == "success") {
                    image = result.file;
                } else {
                    alert("Ошибка при загрузке файла :(");
                }
            },
        });
    }
});
$("#create").on("click", () => {
    $.post("/createPetition", {
        title: $("#title").val(),
        description: $("#description").val(),
        image: image,
        author: $("#address").val(),
    }).done((response) => {
        console.log(response);
        if (response.data != "petition already exists") {
            location.href = "/p/" + response.data;
        } else {
            alert("Ошибка :(");
        }
    });
});
