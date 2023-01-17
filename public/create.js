let image = null

$("#image").change(() => {
  //on change event
  formdata = new FormData()
  if ($("#image").prop("files").length > 0) {
    file = $("#image").prop("files")[0]
    formdata.append("image", file)

    jQuery.ajax({
      url: "/upload",
      type: "POST",
      data: formdata,
      processData: false,
      contentType: false,
      success: function (result) {
        if (result.status == "success") {
          image = result.file
        } else {
          alert("Ошибка при загрузке файла :(")
        }
      },
    })
  }
})
$("#create").on("click", () => {
  if (
    $("#address").val() == "" ||
    $("#address").val().length < 48 ||
    $("#address").val().length > 48
  ) {
    alert("Ошибка: Некорректный адрес кошелька :(")
  } else {
    $.post("/createPetition", {
      title: $("#title").val(),
      description: $("#description").val(),
      image: image,
      author: $("#address").val(),
    }).done((response) => {
      if (response.data == "petition already exists") {
        alert("Ошибка :(")
      } else if (response.data == "uninitialized") {
        alert("Ошибка: Кошелек не существует или не имеет транзакций :(")
      } else {
        location.href = "/p/" + response.data
      }
    })
  }
})
